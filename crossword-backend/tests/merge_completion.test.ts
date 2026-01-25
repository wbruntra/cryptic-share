import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import db from '../db-knex'
import { SessionService } from '../services/sessionService'

describe('Session Reconciliation Completion', () => {
  beforeEach(async () => {
    await db.migrate.latest()
    await db('puzzle_sessions').del()
    await db('puzzles').del()
    await db('users').del()

    // Create a dummy puzzle with explicit letter_count
    // Grid: 'A B' (3 chars, 2 letters)
    await db('puzzles').insert({
      id: 1,
      title: 'Test Puzzle',
      grid: 'A B', 
      letter_count: 2,
      clues: JSON.stringify({ across: [], down: [] }),
    })

    // Create a dummy user
    await db('users').insert({
      id: 1,
      username: 'testuser',
      password_hash: 'hash',
    })
  })

  afterEach(async () => {
    await db.migrate.rollback()
  })

  it('should update is_complete when merging a complete anonymous session into an incomplete user session', async () => {
    const anonymousId = 'anon-complete'

    // 1. Create User Session: Incomplete (Empty)
    const userSessionId = await SessionService.createOrResetSession(1, 1)
    
    // Verify user session is not complete
    let userSession = await db('puzzle_sessions').where({ session_id: userSessionId }).first()
    expect(userSession.is_complete).toBeFalsy()

    // 2. Create Anonymous Session: Complete
    const anonSessionId = await SessionService.createOrResetSession(null, 1, anonymousId)
    // Fill 'A' and 'B' (at indices 0 and 2)
    await SessionService.updateCell(anonSessionId, 0, 0, 'A')
    await SessionService.updateCell(anonSessionId, 0, 2, 'B')
    
    // Wait for debounce/save to ensure anon session is marked complete in DB
    // (Though sync uses current state, ensuring it's valid is good)
    await new Promise((r) => setTimeout(r, 1100))

    // Verify anon session IS complete
    const anonSession = await db('puzzle_sessions').where({ session_id: anonSessionId }).first()
    expect(anonSession.is_complete).toBeTruthy()

    // 3. Sync
    const count = await SessionService.syncSessions(1, [anonSessionId])
    expect(count).toBe(1)

    // 4. Verify User Session is now marked complete
    userSession = await db('puzzle_sessions').where({ session_id: userSessionId }).first()
    expect(userSession.is_complete).toBeTruthy()
    
    // Verify state is merged correctly
    const state = JSON.parse(userSession.state)
    expect(state[0][0]).toBe('A')
    expect(state[0][2]).toBe('B')
  })
})
