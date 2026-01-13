import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import db from '../db-knex'
import { SessionService } from '../services/sessionService'

describe('Session Reconciliation', () => {
  beforeEach(async () => {
    await db.migrate.latest()
    await db('puzzle_sessions').del()
    await db('puzzles').del()
    await db('users').del()

    // Create a dummy puzzle
    await db('puzzles').insert({
      id: 1,
      title: 'Test Puzzle',
      grid: 'A B\nC D',
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

  it('should simple claim (no conflict) when user has no session', async () => {
    const anonymousId = 'anon-1'
    // Create anonymous session
    const anonSessionId = await SessionService.createOrResetSession(null, 1, anonymousId)

    // Simulate some progress
    await SessionService.updateCell(anonSessionId, 0, 0, 'A')
    // Wait for debounce
    await new Promise((r) => setTimeout(r, 1100))

    // Sync
    const count = await SessionService.syncSessions(1, [anonSessionId])
    expect(count).toBe(1)

    // Verify session is now owned by user
    const session = await db('puzzle_sessions').where({ session_id: anonSessionId }).first()
    expect(session.user_id).toBe(1)
  })

  it('should merge sessions when conflict exists', async () => {
    const anonymousId = 'anon-2'

    // 1. Create User Session with some state: Top Left 'A'
    const userSessionId = await SessionService.createOrResetSession(1, 1)
    await SessionService.updateCell(userSessionId, 0, 0, 'A')
    await new Promise((r) => setTimeout(r, 1100))

    // 2. Create Anonymous Session with conflicting state: Top Left 'X', Bottom Right 'D'
    const anonSessionId = await SessionService.createOrResetSession(null, 1, anonymousId)
    await SessionService.updateCell(anonSessionId, 0, 0, 'X') // Should override 'A'
    await SessionService.updateCell(anonSessionId, 1, 1, 'D') // Should be added
    await new Promise((r) => setTimeout(r, 1100))

    // 3. Sync
    const count = await SessionService.syncSessions(1, [anonSessionId])
    expect(count).toBe(1)

    // 4. Verify Anonymous Session is deleted
    const anonSession = await db('puzzle_sessions').where({ session_id: anonSessionId }).first()
    expect(anonSession).toBeUndefined()

    // 5. Verify User Session has merged state
    const userSession = await db('puzzle_sessions').where({ session_id: userSessionId }).first()
    const state = JSON.parse(userSession.state)

    // Expect Top Left 'X' (from anon), Bottom Right 'D' (from anon)
    // Grid: 'A B\nC D' (2x2)
    // Coords: (0,0) is 'A', (1,1) is 'D' (in the grid example letters, not values)

    // State[0][0] should be 'X'
    expect(state[0][0]).toBe('X')

    // State[1][1] should be 'D'
    expect(state[1][1]).toBe('D')
  })

  it('should fill gaps from user session when merging', async () => {
    const anonymousId = 'anon-3'

    // 1. Create User Session: (0,0)='A', (0,1)='B'
    const userSessionId = await SessionService.createOrResetSession(1, 1)
    await SessionService.updateCell(userSessionId, 0, 0, 'A')
    await SessionService.updateCell(userSessionId, 0, 1, 'B')
    await new Promise((r) => setTimeout(r, 1100))

    // 2. Create Anonymous Session: (0,0)='Z' (conflict), (0,1) empty (gap)
    const anonSessionId = await SessionService.createOrResetSession(null, 1, anonymousId)
    await SessionService.updateCell(anonSessionId, 0, 0, 'Z')
    await new Promise((r) => setTimeout(r, 1100))

    // 3. Sync
    await SessionService.syncSessions(1, [anonSessionId])

    // 4. Verify
    const userSession = await db('puzzle_sessions').where({ session_id: userSessionId }).first()
    const state = JSON.parse(userSession.state)

    // (0,0) -> 'Z' (from anon)
    expect(state[0][0]).toBe('Z')
    // (0,1) -> 'B' (from user, preserved because anon was empty there)
    expect(state[0][1]).toBe('B')
  })
})
