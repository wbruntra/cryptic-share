/**
 * Transcribe crossword clues from a PDF using OpenAI vision.
 *
 * This script converts PDF pages to images and uses OpenAI to extract
 * crossword clues, then stores them in the database.
 *
 * USAGE:
 *   bun scripts/transcribe-clues-from-pdf.ts <pdf_file> [options]
 *   bun scripts/transcribe-clues-from-pdf.ts --help
 *
 * PDF NAMING:
 *   Name your PDF with the pattern: <anything>_<start>_<end>.pdf
 *   Examples:
 *     - clues_97_100.pdf → starts at puzzle 97 (3 pages)
 *     - london_5_12.pdf → starts at puzzle 5 (8 pages)
 *   The script extracts the starting puzzle number from the filename.
 *   You can override with --start <n> flag if needed.
 *
 * OPTIONS:
 *   --help         Show this help message
 *   --book <n>     Book number (default: 3)
 *   --start <n>    Starting puzzle number (overrides filename)
 *   --dry-run      Preview changes without saving to DB
 *   --no-publish   Skip marking puzzles as is_published=true (publishing is default)
 *
 * EXAMPLES:
 *   # Process puzzles 97-100 from book 3
 *   bun scripts/transcribe-clues-from-pdf.ts clues_97_100.pdf
 *
 *   # Dry run to preview
 *   bun scripts/transcribe-clues-from-pdf.ts clues_97_100.pdf --dry-run
 *
 *   # Different book without publishing
 *   bun scripts/transcribe-clues-from-pdf.ts clues_5_12.pdf --book 2 --no-publish
 *
 * REQUIREMENTS:
 *   - pdftoppm (from poppler-utils): sudo apt-get install poppler-utils
 *   - OpenAI API key in environment
 *   - Puzzles must exist in the database for the given book/puzzle_number
 */

import { resolve, basename } from 'path'
import { tmpdir } from 'os'
import minimist from 'minimist'
import db from '../db-knex'
import { getCrosswordClues } from '../utils/openai'

const HELP_TEXT = `
Transcribe crossword clues from a PDF using OpenAI vision.

USAGE:
  bun scripts/transcribe-clues-from-pdf.ts <pdf_file> [options]

PDF NAMING:
  Name your PDF with the pattern: <anything>_<start>_<end>.pdf

  Examples:
    clues_97_100.pdf   → starts at puzzle 97 (3 pages)
    london_5_12.pdf    → starts at puzzle 5 (8 pages)

  The script extracts the starting puzzle number from the filename.
  You can override with --start <n> flag if needed.

OPTIONS:
  --help             Show this help message
  --book <n>         Book number (default: 3)
  --start <n>        Starting puzzle number (overrides filename)
  --dry-run          Preview changes without saving to DB
  --no-publish       Skip marking puzzles as is_published=true (publishing is default)

EXAMPLES:
  # Process puzzles 97-100 from book 3 (published by default)
  bun scripts/transcribe-clues-from-pdf.ts clues_97_100.pdf

  # Dry run to preview
  bun scripts/transcribe-clues-from-pdf.ts clues_97_100.pdf --dry-run

  # Different book without publishing
  bun scripts/transcribe-clues-from-pdf.ts clues_5_12.pdf --book 2 --no-publish

  # Override filename-based puzzle number
  bun scripts/transcribe-clues-from-pdf.ts some_file.pdf --start 50

REQUIREMENTS:
  - pdftoppm (from poppler-utils): sudo apt-get install poppler-utils
  - OpenAI API key in environment
  - Puzzles must exist in the database for the given book/puzzle_number
`.trim()

function parseStartFromFilename(pdfPath: string): number | null {
  const name = basename(pdfPath)
  const match = name.match(/(\d+)_(\d+)\.pdf$/i)
  if (match) return Number(match[1])
  return null
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
  const prefix = `${tmpdir()}/cluepdf_${Date.now()}_page`
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
    string: ['book', 'start'],
    boolean: ['dry-run', 'no-publish', 'help'],
    default: { 'no-publish': false },
    alias: {
      h: 'help',
      b: 'book',
      s: 'start',
    },
  })

  if (argv.help) {
    console.log(HELP_TEXT)
    process.exit(0)
  }

  const pdfPath = argv._[0] as string | undefined

  if (!pdfPath) {
    console.error('Error: PDF file path is required\n')
    console.error(HELP_TEXT)
    process.exit(1)
  }

  const resolvedPath = resolve(process.cwd(), pdfPath)
  const book = argv.book ?? '3'
  const dryRun = argv['dry-run'] ?? false
  const publish = !argv['no-publish']
  const explicitStart = argv.start ? Number(argv.start) : null

  await checkPdftoppm()

  const startPuzzle = explicitStart ?? parseStartFromFilename(resolvedPath)
  if (startPuzzle === null) {
    console.error('Error: Could not determine starting puzzle number')
    console.error('Use --start <n> or name the file like clues_97_100.pdf\n')
    console.error(HELP_TEXT)
    process.exit(1)
  }

  console.log(`PDF: ${resolvedPath}`)
  console.log(`Book: ${book}, Starting puzzle: ${startPuzzle}`)
  if (dryRun) console.log('DRY RUN — no database changes will be made')
  if (!publish) console.log('--no-publish: puzzles will NOT be marked as published')
  else console.log('Puzzles will be marked is_published=true after clues are saved')

  console.log('\nConverting PDF pages to images...')
  const imageFiles = await pdfToImages(pdfPath)
  console.log(`Found ${imageFiles.length} page(s)`)

  let saved = 0
  let skipped = 0
  let failed = 0

  for (let i = 0; i < imageFiles.length; i++) {
    const imageFile = imageFiles[i]!
    const puzzleNumber = startPuzzle + i

    console.log(`\n[Page ${i + 1}] Puzzle ${puzzleNumber} — ${imageFile}`)

    // Look up puzzle in DB
    const puzzle = await db('puzzles')
      .select('id', 'clues')
      .where({ book, puzzle_number: puzzleNumber })
      .first()

    if (!puzzle) {
      console.log(`  ⚠️  No puzzle found in DB for book=${book} puzzle_number=${puzzleNumber}, skipping`)
      skipped++
      continue
    }

    // Check if clues are already filled
    let existingClues: any
    try {
      existingClues = JSON.parse(puzzle.clues)
    } catch {
      existingClues = null
    }

    const hasPending =
      !existingClues ||
      (existingClues.across ?? []).some((c: any) => c.clue === '[CLUE PENDING]') ||
      (existingClues.down ?? []).some((c: any) => c.clue === '[CLUE PENDING]')

    if (!hasPending) {
      console.log(`  ⏭️  Clues already filled for puzzle ${puzzleNumber} (id=${puzzle.id}), skipping`)
      skipped++
      continue
    }

    // Transcribe
    console.log(`  Transcribing clues via AI...`)
    let transcribed: any
    try {
      const arrayBuffer = await Bun.file(imageFile).arrayBuffer()
      const base64 = Buffer.from(arrayBuffer).toString('base64')
      transcribed = await getCrosswordClues(base64)
    } catch (err: any) {
      console.error(`  ❌ Transcription failed: ${err.message}`)
      failed++
      continue
    }

    console.log(`  Got ${transcribed.across?.length ?? 0} across, ${transcribed.down?.length ?? 0} down clues`)

    if (dryRun) {
      console.log(`  🧪 Would update puzzle id=${puzzle.id}`)
      console.log('  Sample:', JSON.stringify(transcribed.across?.slice(0, 2)))
      saved++
      continue
    }

    // Save to DB
    const update: Record<string, any> = {
      clues: JSON.stringify(transcribed),
    }
    if (publish) {
      update.is_published = true
    }

    await db('puzzles').where({ id: puzzle.id }).update(update)
    console.log(`  ✅ Saved clues for puzzle ${puzzleNumber} (id=${puzzle.id})${publish ? ', published' : ''}`)
    saved++
  }

  console.log('\nSummary')
  console.log('-------')
  console.log(`Saved:   ${saved}`)
  console.log(`Skipped: ${skipped}`)
  console.log(`Failed:  ${failed}`)

  await db.destroy()
}

main().catch(async (err) => {
  console.error('Fatal error:', err)
  await db.destroy()
  process.exit(1)
})
