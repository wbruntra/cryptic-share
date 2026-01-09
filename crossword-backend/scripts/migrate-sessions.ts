import db from '../db-knex'
import { migrateLegacyState } from '../utils/stateHelpers'

async function migrateSessions() {
  console.log('Starting migration of puzzle_sessions...')

  try {
    const sessions = await db('puzzle_sessions').select('session_id', 'state')
    let migratedCount = 0

    for (const session of sessions) {
      if (!session.state) continue

      try {
        const currentState = JSON.parse(session.state)
        // Check if migration is needed (i.e. if it's string[][])
        // The helper handles converting string[][] to string[], and leaves string[] alone
        // But we want to know if we *changed* it to count migrations.

        const newState = migrateLegacyState(currentState)

        // Simple equality check is hard with objects/arrays, so let's re-stringify
        const currentJson = JSON.stringify(currentState)
        const newJson = JSON.stringify(newState)

        if (currentJson !== newJson) {
          await db('puzzle_sessions')
            .where({ session_id: session.session_id })
            .update({ state: newJson })
          migratedCount++
        }
      } catch (e) {
        console.error(`Failed to migrate session ${session.session_id}:`, e)
      }
    }

    console.log(`Migration complete. Migrated ${migratedCount} sessions.`)
  } catch (e) {
    console.error('Migration failed:', e)
  } finally {
    await db.destroy()
  }
}

migrateSessions()
