import db from '../db-knex'
import { calculateLetterCount, countFilledLetters, migrateLegacyState } from '../utils/stateHelpers'

async function run() {
  console.log('Starting audit and fix of session completion status...')

  // 1. Ensure puzzles have letter_count
  console.log('Checking puzzle letter counts...')
  const puzzles = await db('puzzles').select('id', 'grid', 'letter_count')
  
  for (const puzzle of puzzles) {
    const calculatedCount = calculateLetterCount(puzzle.grid)
    if (puzzle.letter_count !== calculatedCount) {
      console.log(`Updating puzzle ${puzzle.id} letter_count: ${puzzle.letter_count} -> ${calculatedCount}`)
      await db('puzzles').where({ id: puzzle.id }).update({ letter_count: calculatedCount })
    }
  }

  // 2. Check sessions
  console.log('Checking sessions...')
  
  // Fetch sessions with their puzzle's letter count
  const sessions = await db('puzzle_sessions')
    .join('puzzles', 'puzzle_sessions.puzzle_id', 'puzzles.id')
    .select(
      'puzzle_sessions.session_id',
      'puzzle_sessions.state',
      'puzzle_sessions.is_complete',
      'puzzles.letter_count',
      'puzzles.id as puzzle_id'
    )

  let fixedCount = 0
  let totalProcessed = 0

  for (const session of sessions) {
    totalProcessed++
    
    // Parse and migrate state
    let state: string[] = []
    try {
      const parsed = JSON.parse(session.state)
      state = migrateLegacyState(parsed)
    } catch (e) {
      console.error(`Failed to parse state for session ${session.session_id}`)
      continue
    }

    const filledCount = countFilledLetters(state)
    const isActuallyComplete = session.letter_count != null && filledCount >= session.letter_count
    
    // Check for discrepancy
    // current status is 0/1 (sqlite boolean) or true/false
    const currentStatus = Boolean(session.is_complete)
    
    console.log(`Session ${session.session_id.slice(0, 8)}... (Puzzle ${session.puzzle_id}): Filled ${filledCount}/${session.letter_count} | DB is_complete=${session.is_complete} | Calc Complete=${isActuallyComplete}`)

    if (isActuallyComplete && !currentStatus) {
      console.log(`Fixing session ${session.session_id} (Puzzle ${session.puzzle_id}): Filled ${filledCount}/${session.letter_count} but is_complete=${session.is_complete}`)
      
      await db('puzzle_sessions')
        .where({ session_id: session.session_id })
        .update({ 
          is_complete: true,
          updated_at: new Date().toISOString()
        })
      
      fixedCount++
    }
  }

  console.log(`Audit complete.`)
  console.log(`Processed: ${totalProcessed}`)
  console.log(`Fixed: ${fixedCount}`)
  
  process.exit(0)
}

run().catch(err => {
  console.error('Script failed:', err)
  process.exit(1)
})
