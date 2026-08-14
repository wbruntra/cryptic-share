import db from './db-knex'
import { migrateLegacyState, countFilledLetters, calculateLetterCount } from './utils/stateHelpers'

async function fixSessions() {
  const sessions = await db('puzzle_sessions')
    .where('user_id', 2)
    .where('puzzle_id', '<', 150)
    .select('session_id', 'puzzle_id', 'state', 'is_complete')

  console.log(`Found ${sessions.length} sessions for user 2 with puzzle_id < 150`)

  let updated = 0

  for (const session of sessions) {
    const puzzle = await db('puzzles')
      .where({ id: session.puzzle_id })
      .select('grid', 'letter_count')
      .first()

    if (!puzzle) {
      console.log(`  Skipping session ${session.session_id}: puzzle ${session.puzzle_id} not found`)
      continue
    }

    const gridRows = puzzle.grid.trim().split('\n')
    const gridCells = gridRows.map((row) => row.trim().split(' '))

    let state
    try {
      const parsed = JSON.parse(session.state || '[]')
      state = migrateLegacyState(parsed)
    } catch (e) {
      console.log(`  Skipping session ${session.session_id}: failed to parse state`)
      continue
    }

    // Fill all fillable cells (W or N) with 'X' if they are currently empty
    let changed = false
    const filledState = gridCells.map((cells, rowIdx) => {
      let stateRow = state[rowIdx] || ''
      let newRow = ''
      for (let colIdx = 0; colIdx < cells.length; colIdx++) {
        const gridCell = cells[colIdx]
        const stateChar = stateRow[colIdx] || ' '
        if ((gridCell === 'W' || gridCell === 'N') && (stateChar === ' ' || stateChar === '')) {
          newRow += 'X'
          changed = true
        } else {
          newRow += stateChar || ' '
        }
      }
      return newRow
    })

    if (!changed && session.is_complete) {
      continue // Already complete
    }

    // Verify: count filled letters
    const filledCount = countFilledLetters(filledState)
    const letterCount = calculateLetterCount(puzzle.grid)

    if (filledCount < letterCount) {
      console.log(`  WARNING session ${session.session_id} (puzzle ${session.puzzle_id}): filled ${filledCount}/${letterCount} even after fill`)
      continue
    }

    await db('puzzle_sessions')
      .where({ session_id: session.session_id })
      .update({
        state: JSON.stringify(filledState),
        is_complete: true,
        updated_at: new Date().toISOString(),
      })

    updated++
    console.log(`  Updated session ${session.session_id} (puzzle ${session.puzzle_id}) — was ${session.is_complete ? 'complete' : 'incomplete'}, now complete`)
  }

  console.log(`\nDone. Updated ${updated} sessions.`)
}

fixSessions().catch(err => {
  console.error('Error fixing sessions:', err)
  process.exit(1)
})
