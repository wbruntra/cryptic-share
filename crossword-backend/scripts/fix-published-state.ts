import db from '../db-knex'
import { PuzzleService } from '../services/puzzleService'

async function main() {
  console.log('Fetching all puzzles...')
  const puzzles = await db('puzzles').select('id', 'clues', 'is_published')

  let updatedCount = 0
  let publishedCount = 0
  let unpublishedCount = 0

  for (const puzzle of puzzles) {
    const isMissingClues = PuzzleService.hasMissingClues(puzzle.clues)
    const shouldBePublished = !isMissingClues

    // SQLite might store booleans as 1/0
    const currentState = Boolean(puzzle.is_published)

    if (currentState !== shouldBePublished) {
      await db('puzzles')
        .where({ id: puzzle.id })
        .update({ is_published: shouldBePublished })
      
      updatedCount++
      console.log(`Updated puzzle ${puzzle.id}: is_published = ${shouldBePublished}`)
    }

    if (shouldBePublished) {
      publishedCount++
    } else {
      unpublishedCount++
    }
  }

  console.log('\nSummary:')
  console.log(`- Total Puzzles: ${puzzles.length}`)
  console.log(`- Updated: ${updatedCount}`)
  console.log(`- Published: ${publishedCount}`)
  console.log(`- Unpublished (Missing Clues): ${unpublishedCount}`)

  await db.destroy()
}

main().catch(async (error) => {
  console.error('Error fixing published state:', error)
  await db.destroy()
  process.exit(1)
})
