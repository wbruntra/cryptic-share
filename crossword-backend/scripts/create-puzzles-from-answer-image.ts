import { resolve } from 'path'
import db from '../db-knex'
import { transcribeAnswers } from '../utils/openai'
import { calculateLetterCount } from '../utils/stateHelpers'
import { constructGridFromAnswerKey } from '../utils/gridConstructor'

interface AnswerEntry {
  number: number
  answer: string
}

interface AnswerPuzzle {
  puzzle_id: number
  across: AnswerEntry[]
  down: AnswerEntry[]
}

interface AnswerResponse {
  puzzles: AnswerPuzzle[]
}

type GridMapInput =
  | Record<string, string | { rows?: string[]; grid?: string[] }>
  | { puzzles: Array<{ puzzle_id: number; grid?: string; rows?: string[] }> }
  | Array<{ puzzle_id: number; grid?: string; rows?: string[] }>

interface CliOptions {
  imagePath?: string
  gridsPath?: string
  outputPath: string
  dryRun: boolean
  updateExisting: boolean
  skipValidation: boolean
  width: number
  height: number
}

const BOOK_ID = '3'

function removeAccents(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function rot13(str: string): string {
  return str.replace(/[a-zA-Z]/g, (char) => {
    const base = char <= 'Z' ? 65 : 97
    return String.fromCharCode(((char.charCodeAt(0) - base + 13) % 26) + base)
  })
}

function normalizeAnswer(answer: string): string {
  return removeAccents(answer).toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function parseGrid(grid: string): string {
  const rows = grid
    .trim()
    .split('\n')
    .map((row) => row.trim())
    .filter(Boolean)

  if (rows.length === 0) {
    throw new Error('Grid has no rows')
  }

  const width = rows[0]!.split(' ').length

  for (const row of rows) {
    const cells = row.split(' ')
    if (cells.length !== width) {
      throw new Error(`Grid row width mismatch: expected ${width}, got ${cells.length}`)
    }
    for (const cell of cells) {
      if (cell !== 'N' && cell !== 'W' && cell !== 'B') {
        throw new Error(`Invalid grid cell '${cell}' (expected N/W/B)`)
      }
    }
  }

  return rows.join('\n')
}

function gridFromRows(rows: string[] | undefined): string | null {
  if (!rows || rows.length === 0) return null
  return rows.map((row) => row.trim()).filter(Boolean).join('\n')
}

function loadGridMap(raw: GridMapInput): Map<number, string> {
  const result = new Map<number, string>()

  const add = (puzzleId: number, grid: string | null) => {
    if (!grid) return
    result.set(puzzleId, parseGrid(grid))
  }

  if (Array.isArray(raw)) {
    for (const item of raw) {
      const grid = item.grid ?? gridFromRows(item.rows)
      add(item.puzzle_id, grid ?? null)
    }
    return result
  }

  if ('puzzles' in raw && Array.isArray(raw.puzzles)) {
    for (const item of raw.puzzles) {
      const grid = item.grid ?? gridFromRows(item.rows)
      add(item.puzzle_id, grid ?? null)
    }
    return result
  }

  for (const [key, value] of Object.entries(raw)) {
    const puzzleId = Number(key)
    if (!Number.isFinite(puzzleId)) continue

    if (typeof value === 'string') {
      add(puzzleId, value)
      continue
    }

    const grid = value.grid ? gridFromRows(value.grid) : gridFromRows(value.rows)
    add(puzzleId, grid)
  }

  return result
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    outputPath: 'transcribed_answers.json',
    dryRun: false,
    updateExisting: false,
    skipValidation: false,
    width: 15,
    height: 15,
  }

  const positional: string[] = []

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg) continue

    if (arg === '--dry-run') {
      options.dryRun = true
      continue
    }
    if (arg === '--update-existing') {
      options.updateExisting = true
      continue
    }
    if (arg === '--skip-validation') {
      options.skipValidation = true
      continue
    }
    if (arg === '--output') {
      options.outputPath = argv[i + 1] ?? options.outputPath
      i++
      continue
    }
    if (arg === '--width') {
      const value = Number(argv[i + 1])
      if (Number.isFinite(value) && value > 0) options.width = value
      i++
      continue
    }
    if (arg === '--height') {
      const value = Number(argv[i + 1])
      if (Number.isFinite(value) && value > 0) options.height = value
      i++
      continue
    }

    positional.push(arg)
  }

  options.imagePath = positional[0]
  options.gridsPath = positional[1]
  return options
}

function usage() {
  console.log(
    'Usage: bun run scripts/create-puzzles-from-answer-image.ts <answer_image_path> [grids_json_path] [--width <n>] [--height <n>] [--output <file>] [--dry-run] [--update-existing] [--skip-validation]',
  )
  console.log('')
  console.log('When grids_json_path is omitted, grid is constructed from the answer key.')
  console.log('Default construction size is 15x15; override with --width/--height.')
  console.log('')
  console.log('grids_json_path supports:')
  console.log('  - { "puzzles": [{ "puzzle_id": 34, "grid": "N W ..." }] }')
  console.log('  - [{ "puzzle_id": 34, "rows": ["N W ...", "..."] }]')
  console.log('  - { "34": "N W ...\\n...", "35": { "rows": ["..."] } }')
}

async function main() {
  const options = parseArgs(Bun.argv.slice(2))
  if (!options.imagePath) {
    usage()
    process.exit(1)
  }

  const imagePath = resolve(process.cwd(), options.imagePath)
  const outputPath = resolve(process.cwd(), options.outputPath)

  console.log(`Transcribing answer image: ${imagePath}`)
  const gridsByPuzzle = new Map<number, string>()
  if (options.gridsPath) {
    const gridsPath = resolve(process.cwd(), options.gridsPath)
    console.log(`Using optional grids map: ${gridsPath}`)

    const gridsRawText = await Bun.file(gridsPath).text()
    const gridsRaw = JSON.parse(gridsRawText) as GridMapInput
    const loaded = loadGridMap(gridsRaw)
    for (const [k, v] of loaded.entries()) gridsByPuzzle.set(k, v)
    if (gridsByPuzzle.size === 0) {
      throw new Error('No usable grids found in grids JSON file')
    }
  } else {
    console.log(`No grids map provided; constructing grids from answers at ${options.width}x${options.height}`)
  }

  const imageFile = Bun.file(imagePath)
  const transcription = (await transcribeAnswers(imageFile)) as AnswerResponse

  await Bun.write(outputPath, JSON.stringify(transcription, null, 2))
  console.log(`Saved raw transcription to ${outputPath}`)

  let created = 0
  let updated = 0
  let skipped = 0
  let failed = 0

  for (const puzzle of transcription.puzzles) {
    const puzzleNumber = puzzle.puzzle_id
    let grid = gridsByPuzzle.get(puzzleNumber)

    const normalizedAcross = puzzle.across.map((a) => ({
      number: a.number,
      answer: normalizeAnswer(a.answer),
    }))
    const normalizedDown = puzzle.down.map((a) => ({
      number: a.number,
      answer: normalizeAnswer(a.answer),
    }))

    if (!grid) {
      const constructed = constructGridFromAnswerKey(
        {
          width: options.width,
          height: options.height,
          across: normalizedAcross,
          down: normalizedDown,
        },
        { maxStates: 2_000_000, maxMillis: 12_000 },
      )

      if (!constructed.success || !constructed.gridString) {
        console.warn(
          `⚠️  Puzzle ${puzzleNumber}: failed to construct grid from answers (${constructed.message}), skipping`,
        )
        failed++
        continue
      }

      grid = constructed.gridString
      console.log(`🧩 Puzzle ${puzzleNumber}: constructed grid from answers`) 
    }

    const encryptedAnswers = {
      puzzle_id: puzzleNumber,
      across: puzzle.across.map((a) => ({
        number: a.number,
        answer: rot13(removeAccents(a.answer)),
      })),
      down: puzzle.down.map((a) => ({
        number: a.number,
        answer: rot13(removeAccents(a.answer)),
      })),
    }

    const placeholderClues = {
      across: puzzle.across.map((a) => ({ number: a.number, clue: '[CLUE PENDING]' })),
      down: puzzle.down.map((a) => ({ number: a.number, clue: '[CLUE PENDING]' })),
    }

    if (!options.skipValidation) {
      const rows = grid.split('\n').map((row) => row.split(' '))
      const width = rows[0]!.length
      const height = rows.length

      const validation = constructGridFromAnswerKey(
        {
          width,
          height,
          across: normalizedAcross,
          down: normalizedDown,
        },
        { maxStates: 2_000_000, maxMillis: 12_000 },
      )

      if (!validation.success) {
        console.warn(
          `⚠️  Puzzle ${puzzleNumber}: failed answer/grid validation (${validation.message}), skipping`,
        )
        failed++
        continue
      }
    }

    const existing = await db('puzzles')
      .where({ book: BOOK_ID, puzzle_number: puzzleNumber })
      .first('id')

    if (options.dryRun) {
      if (existing) {
        console.log(
          `🧪 Puzzle ${puzzleNumber}: would ${options.updateExisting ? 'update' : 'skip'} existing id=${existing.id}`,
        )
      } else {
        console.log(`🧪 Puzzle ${puzzleNumber}: would create new puzzle`)
      }
      continue
    }

    const payload = {
      title: String(puzzleNumber),
      grid,
      clues: JSON.stringify(placeholderClues),
      answers_encrypted: JSON.stringify(encryptedAnswers),
      letter_count: calculateLetterCount(grid),
      puzzle_number: puzzleNumber,
      book: BOOK_ID,
    }

    if (existing) {
      if (!options.updateExisting) {
        console.log(`⏭️  Puzzle ${puzzleNumber}: exists (id=${existing.id}), skipping`)
        skipped++
        continue
      }

      await db('puzzles').where({ id: existing.id }).update(payload)
      console.log(`♻️  Puzzle ${puzzleNumber}: updated existing id=${existing.id}`)
      updated++
      continue
    }

    const [newId] = await db('puzzles').insert(payload)
    console.log(`✅ Puzzle ${puzzleNumber}: created id=${newId}`)
    created++
  }

  console.log('\nSummary')
  console.log('-------')
  console.log(`Created: ${created}`)
  console.log(`Updated: ${updated}`)
  console.log(`Skipped: ${skipped}`)
  console.log(`Failed validation: ${failed}`)

  await db.destroy()
}

main().catch(async (error) => {
  console.error('Error creating puzzles from answer image:', error)
  await db.destroy()
  process.exit(1)
})
