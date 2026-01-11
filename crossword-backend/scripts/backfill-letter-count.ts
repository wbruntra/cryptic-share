/**
 * Backfill letter_count for existing puzzles
 */
import db from '../db-knex'
import { calculateLetterCount } from '../utils/stateHelpers'

async function backfillLetterCount() {
  console.log('Starting backfill of puzzle letter_count...')

  const puzzles = await db('puzzles').select('id', 'grid', 'letter_count')

  let updated = 0
  for (const puzzle of puzzles) {
    const letterCount = calculateLetterCount(puzzle.grid)

    if (puzzle.letter_count !== letterCount) {
      await db('puzzles').where({ id: puzzle.id }).update({ letter_count: letterCount })
      console.log(`  Updated puzzle ${puzzle.id}: letter_count = ${letterCount}`)
      updated++
    }
  }

  console.log(`Backfill complete. Updated ${updated} of ${puzzles.length} puzzles.`)
  process.exit(0)
}

backfillLetterCount().catch((err) => {
  console.error('Backfill failed:', err)
  process.exit(1)
})
