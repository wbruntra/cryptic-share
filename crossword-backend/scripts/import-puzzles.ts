/**
 * Import puzzles, clue_explanations, and parsewords_puzzles from a JSON file
 * produced by scripts/export-puzzles.ts.
 *
 * Usage:
 *   bun scripts/import-puzzles.ts puzzles-export.json
 *   bun scripts/import-puzzles.ts puzzles-export.json --skip-existing
 *
 * Flags:
 *   --skip-existing   Skip puzzles whose title already exists (default: error)
 *   --dry-run         Print what would be imported without writing to the database
 *
 * IDs from the source server are NOT preserved — new IDs are assigned here so
 * there are no collisions. Explanations and parsewords are linked to the new IDs.
 */
import db from '../db-knex'

const args = process.argv.slice(2)
const skipExisting = args.includes('--skip-existing')
const dryRun = args.includes('--dry-run')
const inputFile = args.find((a) => !a.startsWith('--'))

if (!inputFile) {
  console.error('Usage: bun scripts/import-puzzles.ts <export.json> [--skip-existing] [--dry-run]')
  process.exit(1)
}

async function run() {
  const text = await Bun.file(inputFile!).text()
  const data = JSON.parse(text) as {
    exported_at: string
    puzzles: Record<string, unknown>[]
    clue_explanations: Record<string, unknown>[]
    parsewords_puzzles: Record<string, unknown>[]
  }

  const { puzzles, clue_explanations, parsewords_puzzles } = data

  console.log(`Import file exported at: ${data.exported_at}`)
  console.log(`  ${puzzles.length} puzzle(s)`)
  console.log(`  ${clue_explanations.length} explanation(s)`)
  console.log(`  ${parsewords_puzzles.length} parsewords puzzle(s)`)
  if (dryRun) console.log('\n[DRY RUN — no writes will occur]\n')

  // Map old puzzle IDs -> new puzzle IDs
  const idMap = new Map<number, number>()

  for (const puzzle of puzzles) {
    const oldId = puzzle.id as number
    const title = puzzle.title as string

    // Check for existing puzzle with same title
    const existing = await db('puzzles').where('title', title).first()
    if (existing) {
      if (skipExisting) {
        console.log(`  Skipping puzzle "${title}" (already exists with id=${existing.id})`)
        idMap.set(oldId, existing.id)
        continue
      } else {
        console.error(
          `Puzzle with title "${title}" already exists (id=${existing.id}). ` +
            'Use --skip-existing to skip duplicates.',
        )
        process.exit(1)
      }
    }

    // Strip the old id so the DB assigns a fresh one
    const { id: _oldId, ...puzzleData } = puzzle

    if (dryRun) {
      console.log(`  [dry-run] Would insert puzzle "${title}"`)
      idMap.set(oldId, -1)
      continue
    }

    const [newId] = await db('puzzles').insert(puzzleData)
    console.log(`  Inserted puzzle "${title}" → id=${newId}`)
    idMap.set(oldId, newId)
  }

  // Import explanations
  let explanationsInserted = 0
  for (const explanation of clue_explanations) {
    const oldPuzzleId = explanation.puzzle_id as number
    const newPuzzleId = idMap.get(oldPuzzleId)
    if (newPuzzleId == null) {
      console.warn(`  Warning: no id mapping for explanation's puzzle_id=${oldPuzzleId}, skipping`)
      continue
    }

    const { id: _id, puzzle_id: _pid, ...rest } = explanation

    if (dryRun) {
      explanationsInserted++
      continue
    }

    await db('clue_explanations')
      .insert({ ...rest, puzzle_id: newPuzzleId })
      .onConflict(['puzzle_id', 'clue_number', 'direction'])
      .merge()

    explanationsInserted++
  }

  if (!dryRun) console.log(`  Inserted/updated ${explanationsInserted} explanation(s)`)
  else console.log(`  [dry-run] Would insert ${explanationsInserted} explanation(s)`)

  // Import parsewords puzzles
  let parsewordsInserted = 0
  for (const pw of parsewords_puzzles) {
    const oldPuzzleId = pw.puzzle_id as number
    const newPuzzleId = idMap.get(oldPuzzleId)
    if (newPuzzleId == null) {
      console.warn(`  Warning: no id mapping for parsewords puzzle_id=${oldPuzzleId}, skipping`)
      continue
    }

    const { id: _id, puzzle_id: _pid, ...rest } = pw

    if (dryRun) {
      parsewordsInserted++
      continue
    }

    await db('parsewords_puzzles')
      .insert({ ...rest, puzzle_id: newPuzzleId })
      .onConflict(['puzzle_id', 'clue_number', 'direction'])
      .merge()

    parsewordsInserted++
  }

  if (!dryRun) console.log(`  Inserted/updated ${parsewordsInserted} parsewords puzzle(s)`)
  else console.log(`  [dry-run] Would insert ${parsewordsInserted} parsewords puzzle(s)`)

  console.log('\nDone.')
  process.exit(0)
}

run().catch((err) => {
  console.error('Import failed:', err)
  process.exit(1)
})
