/**
 * Export puzzles, clue_explanations, and parsewords_puzzles to a JSON file.
 *
 * Usage:
 *   bun scripts/export-puzzles.ts [output.json]
 *   bun scripts/export-puzzles.ts --puzzle-id 5 [output.json]
 *   bun scripts/export-puzzles.ts --published-only [output.json]
 *
 * The output file can be imported on another server with scripts/import-puzzles.ts
 */
import db from '../db-knex'

const args = process.argv.slice(2)

// Parse flags
const publishedOnly = args.includes('--published-only')
const puzzleIdFlag = args.indexOf('--puzzle-id')
const puzzleId = puzzleIdFlag !== -1 ? parseInt(args[puzzleIdFlag + 1]) : null

// Last non-flag arg is the output file
const outputFile =
  args.filter((a) => !a.startsWith('--') && !/^\d+$/.test(a)).at(-1) ?? 'puzzles-export.json'

async function run() {
  // Build puzzle query
  let puzzleQuery = db('puzzles').select('*').orderBy('id')
  if (publishedOnly) puzzleQuery = puzzleQuery.where('is_published', true)
  if (puzzleId != null) puzzleQuery = puzzleQuery.where('id', puzzleId)

  const puzzles = await puzzleQuery
  if (puzzles.length === 0) {
    console.error('No puzzles matched.')
    process.exit(1)
  }

  const puzzleIds = puzzles.map((p: { id: number }) => p.id)
  console.log(`Exporting ${puzzles.length} puzzle(s): ${puzzleIds.join(', ')}`)

  // Fetch associated explanations
  const explanations = await db('clue_explanations')
    .select('*')
    .whereIn('puzzle_id', puzzleIds)
    .orderBy(['puzzle_id', 'clue_number', 'direction'])

  console.log(`  ${explanations.length} clue explanation(s)`)

  // Fetch associated parsewords puzzles
  const parsewords = await db('parsewords_puzzles')
    .select('*')
    .whereIn('puzzle_id', puzzleIds)
    .orderBy(['puzzle_id', 'clue_number', 'direction'])

  console.log(`  ${parsewords.length} parsewords puzzle(s)`)

  const output = {
    exported_at: new Date().toISOString(),
    puzzles,
    clue_explanations: explanations,
    parsewords_puzzles: parsewords,
  }

  await Bun.write(outputFile, JSON.stringify(output, null, 2))
  console.log(`\nExport written to: ${outputFile}`)

  process.exit(0)
}

run().catch((err) => {
  console.error('Export failed:', err)
  process.exit(1)
})
