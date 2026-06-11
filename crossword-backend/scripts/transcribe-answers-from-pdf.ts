/**
 * Transcribe puzzle answers from a PDF using OpenAI vision.
 *
 * This script converts PDF pages to images and uses OpenAI to extract
 * answers, then stores them in the database. Each page covers 4 consecutive puzzles.
 *
 * USAGE:
 *   bun scripts/transcribe-answers-from-pdf.ts <pdf_file> [options]
 *   bun scripts/transcribe-answers-from-pdf.ts --help
 *
 * PDF NAMING:
 *   Name your PDF with the pattern: <anything>_<start>.pdf
 *   Examples:
 *     - solutions_105.pdf → page 1 is puzzles 105-108, page 2 is 109-112, etc.
 *     - answers_50.pdf → page 1 is puzzles 50-53, page 2 is 54-57, etc.
 *   The script extracts the starting puzzle number from the filename.
 *   You can override with --start <n> flag if needed.
 *
 * OPTIONS:
 *   --help              Show this help message
 *   --book <n>          Book number (default: 3)
 *   --start <n>         Starting puzzle number (overrides filename)
 *   --dry-run           Preview changes without saving to DB
 *   --update-existing   Update existing puzzles instead of skipping
 *   --skip-validation   Skip answer/grid validation (faster but riskier)
 *   --width <n>         Grid width for construction (default: 15)
 *   --height <n>        Grid height for construction (default: 15)
 *
 * EXAMPLES:
 *   # Process puzzles 105-112+ from book 3
 *   bun scripts/transcribe-answers-from-pdf.ts solutions_105.pdf
 *
 *   # Dry run to preview
 *   bun scripts/transcribe-answers-from-pdf.ts solutions_105.pdf --dry-run
 *
 *   # Different book and update existing puzzles
 *   bun scripts/transcribe-answers-from-pdf.ts answers_50.pdf --book 2 --update-existing
 *
 * REQUIREMENTS:
 *   - pdftoppm (from poppler-utils): sudo apt-get install poppler-utils
 *   - OpenAI API key in environment
 *   - Puzzles will be created/updated in the database for the given book/puzzle_number
 */

import { resolve, basename } from 'path'
import { tmpdir } from 'os'
import { unlink } from 'fs/promises'
import minimist from 'minimist'
import db from '../db-knex'
import { transcribeAnswers, transcribeAnswersOpenRouter } from '../utils/openai'
import { calculateLetterCount } from '../utils/stateHelpers'
import { constructGridFromAnswerKey } from '../utils/gridConstructor'

const HELP_TEXT = `
Transcribe puzzle answers from a PDF using OpenAI vision.

This script converts PDF pages to images and uses OpenAI to extract
answers, then stores them in the database. Each page covers 4 consecutive puzzles.

USAGE:
  bun scripts/transcribe-answers-from-pdf.ts <pdf_file> [options]

PDF NAMING:
  Name your PDF with the pattern: <anything>_<start>.pdf

  Examples:
    solutions_105.pdf   → page 1 is puzzles 105-108, page 2 is 109-112, etc.
    answers_50.pdf      → page 1 is puzzles 50-53, page 2 is 54-57, etc.

  The script extracts the starting puzzle number from the filename.
  You can override with --start <n> flag if needed.

OPTIONS:
  --help              Show this help message
  --book <n>          Book number (default: 3)
  --start <n>         Starting puzzle number (overrides filename)
  --page <n>          Only process this page number (1-based), skip all others
  --dry-run           Preview changes without saving to DB
  --update-existing   Update existing puzzles instead of skipping
  --skip-validation   Skip answer/grid validation (faster but riskier)
  --width <n>         Grid width for construction (default: 15)
  --height <n>        Grid height for construction (default: 15)

EXAMPLES:
  # Process puzzles 105-112+ from book 3
  bun scripts/transcribe-answers-from-pdf.ts solutions_105.pdf

  # Redo only page 4 (puzzles 117-120) with update-existing
  bun scripts/transcribe-answers-from-pdf.ts solutions_105.pdf --page 4 --update-existing

  # Dry run to preview
  bun scripts/transcribe-answers-from-pdf.ts solutions_105.pdf --dry-run

  # Different book and update existing puzzles
  bun scripts/transcribe-answers-from-pdf.ts answers_50.pdf --book 2 --update-existing

REQUIREMENTS:
  - pdftoppm (from poppler-utils): sudo apt-get install poppler-utils
  - OpenAI API key in environment
  - Puzzles will be created/updated in the database for the given book/puzzle_number
`.trim()

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

function parseStartFromFilename(pdfPath: string): number | null {
  const name = basename(pdfPath)
  const match = name.match(/(\d+)\.pdf$/i)
  if (match) return Number(match[1])
  return null
}

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

async function checkPdftoppm() {
  const result = await Bun.$`which pdftoppm`.quiet().nothrow()
  if (result.exitCode !== 0) {
    console.error('Error: pdftoppm not found. Install poppler-utils:')
    console.error('  sudo apt-get install poppler-utils')
    process.exit(1)
  }
}

async function pdfToImages(pdfPath: string): Promise<string[]> {
  const prefix = `${tmpdir()}/answerpdf_${Date.now()}_page`
  const result = await Bun.$`pdftoppm -jpeg -r 200 ${pdfPath} ${prefix}`.quiet().nothrow()
  if (result.exitCode !== 0) {
    throw new Error(`pdftoppm failed: ${result.stderr.toString()}`)
  }

  // pdftoppm names files like prefix-01.jpg, prefix-02.jpg, etc.
  const glob = new Bun.Glob(`${prefix}-*.jpg`)
  const files: string[] = []
  for await (const file of glob.scan('/')) {
    files.push(file)
  }
  return files.sort()
}

async function main() {
  const argv = minimist(Bun.argv.slice(2), {
    string: ['book', 'start', 'page', 'width', 'height', 'model'],
    boolean: ['dry-run', 'update-existing', 'skip-validation', 'help', 'openrouter'],
    alias: {
      h: 'help',
      b: 'book',
      s: 'start',
      p: 'page',
    },
  })

  if (argv.help) {
    console.log(HELP_TEXT)
    process.exit(0)
  }

  const pdfInput = argv._[0] as string | undefined

  if (!pdfInput) {
    console.error('Error: PDF file path or URL is required\n')
    console.error(HELP_TEXT)
    process.exit(1)
  }

  const isUrl = pdfInput.startsWith('http://') || pdfInput.startsWith('https://')
  let resolvedPath = pdfInput
  let tempPdfPath = ''

  try {
    if (isUrl) {
      console.log(`Downloading PDF from URL: ${pdfInput}...`)
      const response = await fetch(pdfInput)
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const arrayBuffer = await response.arrayBuffer()
      
      let cleanFilename = pdfInput
      try {
        const urlObj = new URL(pdfInput)
        cleanFilename = urlObj.pathname
      } catch (e) {
        // Fallback
      }
      
      tempPdfPath = `${tmpdir()}/downloaded_${Date.now()}_${basename(cleanFilename)}`
      await Bun.write(tempPdfPath, arrayBuffer)
      resolvedPath = tempPdfPath
      console.log(`Downloaded to temporary file: ${resolvedPath}`)
    } else {
      resolvedPath = resolve(process.cwd(), pdfInput)
    }

    const book = argv.book ?? '3'
    const dryRun = argv['dry-run'] ?? false
    const updateExisting = argv['update-existing'] ?? false
    const skipValidation = argv['skip-validation'] ?? false
    const width = argv.width ? Number(argv.width) : 15
    const height = argv.height ? Number(argv.height) : 15
    const explicitStart = argv.start ? Number(argv.start) : null
    const onlyPage = argv.page ? Number(argv.page) : null
    const useOpenRouter = argv.openrouter ?? false
    const modelOverride = argv.model as string | undefined

    await checkPdftoppm()

    const startPuzzle = explicitStart ?? parseStartFromFilename(resolvedPath)
    if (startPuzzle === null) {
      console.error('Error: Could not determine starting puzzle number')
      console.error('Use --start <n> or name the file like solutions_105.pdf\n')
      console.error(HELP_TEXT)
      process.exit(1)
    }

    console.log(`PDF: ${isUrl ? `${pdfInput} (downloaded to ${resolvedPath})` : resolvedPath}`)
    console.log(`Book: ${book}, Starting puzzle: ${startPuzzle}`)
    if (dryRun) console.log('DRY RUN — no database changes will be made')
    if (updateExisting) console.log('--update-existing: existing puzzles will be updated')
    if (onlyPage !== null) console.log(`--page ${onlyPage}: only processing page ${onlyPage}`)

    console.log('\nConverting PDF pages to images...')
    const imageFiles = await pdfToImages(resolvedPath)
    console.log(`Found ${imageFiles.length} page(s)\n`)

    let created = 0
    let updated = 0
    let skipped = 0
    let failed = 0

    for (let pageIndex = 0; pageIndex < imageFiles.length; pageIndex++) {
      const imageFile = imageFiles[pageIndex]!
      const pageNumber = pageIndex + 1
      const firstPuzzleOnPage = startPuzzle + pageIndex * 4

      if (onlyPage !== null && pageNumber !== onlyPage) {
        console.log(`\n[Page ${pageNumber}] Puzzles ${firstPuzzleOnPage}-${firstPuzzleOnPage + 3} — skipped`)
        continue
      }

      console.log(`\n[Page ${pageNumber}] Puzzles ${firstPuzzleOnPage}-${firstPuzzleOnPage + 3} — ${imageFile}`)

      // Transcribe answers from this page
      const expectedIdsArray = [
        firstPuzzleOnPage,
        firstPuzzleOnPage + 1,
        firstPuzzleOnPage + 2,
        firstPuzzleOnPage + 3,
      ]
      let transcription: AnswerResponse
      try {
        const imageBuffer = await Bun.file(imageFile).arrayBuffer()
        const base64 = Buffer.from(imageBuffer).toString('base64')
        if (useOpenRouter) {
          const model = modelOverride ?? 'google/gemini-3.1-flash-lite'
          console.log(`  Using OpenRouter model: ${model}`)
          transcription = (await transcribeAnswersOpenRouter({ base64, mimeType: 'image/jpeg' }, expectedIdsArray, model)) as AnswerResponse
        } else {
          transcription = (await transcribeAnswers({ base64, mimeType: 'image/jpeg' }, expectedIdsArray)) as AnswerResponse
        }
      } catch (err: any) {
        console.error(`  ❌ Transcription failed: ${err.message}`)
        failed += 4 // Assume all 4 puzzles on page failed
        continue
      }

      console.log(`  Got ${transcription.puzzles.length} puzzle(s)`)

      // Sanity-check: only keep puzzles whose ID falls in the expected range for this page
      const expectedIds = new Set(expectedIdsArray)
      const validPuzzles = transcription.puzzles.filter((p) => {
        if (!expectedIds.has(p.puzzle_id)) {
          console.warn(
            `  ⚠️  Puzzle ${p.puzzle_id}: out-of-range for this page (expected ${firstPuzzleOnPage}-${firstPuzzleOnPage + 3}), skipping`,
          )
          return false
        }
        return true
      })
      if (validPuzzles.length !== transcription.puzzles.length) {
        console.warn(
          `  ⚠️  Discarded ${transcription.puzzles.length - validPuzzles.length} out-of-range puzzle(s)`,
        )
      }

      // Process each puzzle from this page
      for (const puzzle of validPuzzles) {
        const puzzleNumber = puzzle.puzzle_id

        const normalizedAcross = puzzle.across.map((a) => ({
          number: a.number,
          answer: normalizeAnswer(a.answer),
        }))
        const normalizedDown = puzzle.down.map((a) => ({
          number: a.number,
          answer: normalizeAnswer(a.answer),
        }))

        // Try to construct grid from answers
        let grid: string | null = null
        const constructed = constructGridFromAnswerKey(
          {
            width,
            height,
            across: normalizedAcross,
            down: normalizedDown,
          },
          { maxStates: 2_000_000, maxMillis: 12_000 },
        )

        if (!constructed.success || !constructed.gridString) {
          console.warn(
            `  ⚠️  Puzzle ${puzzleNumber}: failed to construct grid from answers (${constructed.message}), skipping`,
          )
          failed++
          continue
        }

        grid = constructed.gridString
        console.log(`  🧩 Puzzle ${puzzleNumber}: constructed grid from answers`)

        // Validate unless skipped
        if (!skipValidation) {
          const rows = grid.split('\n').map((row) => row.split(' '))
          const gridWidth = rows[0]!.length
          const gridHeight = rows.length

          const validation = constructGridFromAnswerKey(
            {
              width: gridWidth,
              height: gridHeight,
              across: normalizedAcross,
              down: normalizedDown,
            },
            { maxStates: 2_000_000, maxMillis: 12_000 },
          )

          if (!validation.success) {
            console.warn(
              `  ⚠️  Puzzle ${puzzleNumber}: failed answer/grid validation (${validation.message}), skipping`,
            )
            failed++
            continue
          }
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

        const payload = {
          title: String(puzzleNumber),
          grid,
          clues: JSON.stringify(placeholderClues),
          answers_encrypted: JSON.stringify(encryptedAnswers),
          letter_count: calculateLetterCount(grid),
          puzzle_number: puzzleNumber,
          book,
          is_published: false,
        }

        const existing = await db('puzzles')
          .where({ book, puzzle_number: puzzleNumber })
          .first('id')

        if (dryRun) {
          if (existing) {
            console.log(
              `  🧪 Puzzle ${puzzleNumber}: would ${updateExisting ? 'update' : 'skip'} existing id=${existing.id}`,
            )
          } else {
            console.log(`  🧪 Puzzle ${puzzleNumber}: would create new puzzle`)
          }
          continue
        }

        if (existing) {
          if (!updateExisting) {
            console.log(`  ⏭️  Puzzle ${puzzleNumber}: exists (id=${existing.id}), skipping`)
            skipped++
            continue
          }

          await db('puzzles').where({ id: existing.id }).update(payload)
          console.log(`  ♻️  Puzzle ${puzzleNumber}: updated existing id=${existing.id}`)
          updated++
          continue
        }

        const [newId] = await db('puzzles').insert(payload)
        console.log(`  ✅ Puzzle ${puzzleNumber}: created id=${newId}`)
        created++
      }
    }

    console.log('\n' + '='.repeat(60))
    console.log('Summary')
    console.log('='.repeat(60))
    console.log(`Created: ${created}`)
    console.log(`Updated: ${updated}`)
    console.log(`Skipped: ${skipped}`)
    console.log(`Failed:  ${failed}`)

    await db.destroy()
  } finally {
    if (tempPdfPath) {
      try {
        await unlink(tempPdfPath)
        console.log(`Cleaned up temporary PDF file: ${tempPdfPath}`)
      } catch (err: any) {
        console.warn(`Warning: Failed to clean up temporary PDF: ${err.message}`)
      }
    }
  }
}

main().catch(async (error) => {
  console.error('Fatal error:', error)
  await db.destroy()
  process.exit(1)
})
