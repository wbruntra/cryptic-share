import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import db from '../db-knex'
import { SessionService } from '../services/sessionService'

describe('SessionService', () => {
  beforeEach(async () => {
    // Run migrations to ensure schema exists in memory DB
    await db.migrate.latest()
    // Seed any necessary data or clean up
    await db('puzzle_sessions').del()
    await db('puzzles').del()

    // Create a dummy puzzle
    await db('puzzles').insert({
      id: 1,
      title: 'Test Puzzle',
      grid: 'A B\nC D',
      clues: JSON.stringify({ across: [], down: [] }),
    })
  })

  afterEach(async () => {
    // In memory DB, but good practice to clean/rollback if persistent
    await db.migrate.rollback()
  })

  it('should create a new session for anonymous user', async () => {
    const sessionId = await SessionService.createOrResetSession(null, 1)
    expect(sessionId).toBeDefined()

    const session = await db('puzzle_sessions').where({ session_id: sessionId }).first()
    expect(session).toBeDefined()
    expect(session.user_id).toBeNull()
  })

  it('should create a new session for logged in user if none exists', async () => {
    const userId = 123
    // We don't verify user strict FK in this unit test unless we seed users,
    // but sqlite usually doesn't enforce FK by default unless PRAGMA foreign_keys = ON;
    // For now we assume we can insert user_id without user record if FK disabled,
    // or we should create user. Let's see if it fails.
    // To be safe, let's just insert a user if we have strict mode.
    // But let's try without first as it depends on knex config.
    // Actually our migration adds FK. Let's add a user.
    await db('users').insert({
      id: userId,
      username: 'testu',
      password_hash: 'hash',
    })

    const sessionId = await SessionService.createOrResetSession(userId, 1)
    expect(sessionId).toBeDefined()

    const session = await db('puzzle_sessions').where({ session_id: sessionId }).first()
    expect(session.user_id).toBe(userId)
  })

  it('should reuse and reset session for logged in user', async () => {
    const userId = 456
    await db('users').insert({
      id: userId,
      username: 'testu2',
      password_hash: 'hash',
    })

    // 1. Create first session
    const sessionId1 = await SessionService.createOrResetSession(userId, 1)

    // 2. Update state to simulate progress
    await db('puzzle_sessions')
      .where({ session_id: sessionId1 })
      .update({
        state: JSON.stringify([['A']]),
      })

    // 3. Create "fresh" session
    const sessionId2 = await SessionService.createOrResetSession(userId, 1)

    expect(sessionId2).toBe(sessionId1)

    const session = await db('puzzle_sessions').where({ session_id: sessionId1 }).first()
    expect(session.state).toBe('[]') // Should be reset
  })
  it('should cache updates and debounce database writes', async () => {
    const sessionId = await SessionService.createOrResetSession(null, 1) // Anon session

    // 1. Update cell in memory
    await SessionService.updateCell(sessionId, 0, 0, 'X')

    // 2. Immediate read from Service (should hit cache)
    const result = await SessionService.getSessionWithPuzzle(sessionId)
    expect(result.sessionState[0][0]).toBe('X')

    // 3. Immediate read from DB (should NOT be updated yet due to debounce)
    // Note: createOrResetSession sets state to '[]'.
    // updateCell initializes it in memory but DB save is delayed.
    const dbSessionBefore = await db('puzzle_sessions').where({ session_id: sessionId }).first()
    const stateBefore = JSON.parse(dbSessionBefore.state)
    // It should either be '[]' or if it initialized, it might be the empty grid depending on logic order.
    // Our logic: updateCell loads->inits->updates cache->marks dirty->schedules save.
    // So DB remains '[]' until save.
    expect(stateBefore).toHaveLength(0)

    // 4. Wait for debounce (1s defined in code)
    await new Promise((resolve) => setTimeout(resolve, 1100))

    // 5. Read from DB after wait
    const dbSessionAfter = await db('puzzle_sessions').where({ session_id: sessionId }).first()
    const stateAfter = JSON.parse(dbSessionAfter.state)

    // Check it initialized 2x2 grid and set (0,0) to X
    expect(stateAfter).toHaveLength(2)
    expect(stateAfter[0]).toBeTypeOf('string') // Verify format change
    expect(stateAfter[0][0]).toBe('X')
  })

  it('should migrate legacy string[][] state to string[]', async () => {
    const sessionId = await SessionService.createOrResetSession(null, 1)

    // manually insert legacy state
    const legacyState = JSON.stringify([
      ['A', 'B'],
      ['C', 'D'],
    ])
    await db('puzzle_sessions').where({ session_id: sessionId }).update({ state: legacyState })

    // Read via service - should trigger migration
    const result = await SessionService.getSessionWithPuzzle(sessionId)

    expect(result.sessionState).toBeDefined()
    expect(result.sessionState).toHaveLength(2)
    expect(result.sessionState[0]).toBe('AB')
    expect(result.sessionState[1]).toBe('CD')
  })

  it('getOrCreateSession should find existing session for logged in user', async () => {
    const userId = 789
    await db('users').insert({
      id: userId,
      username: 'testu3',
      password_hash: 'hash',
    })

    // Create first session
    const result1 = await SessionService.getOrCreateSession(userId, 1)
    expect(result1.isNew).toBe(true)

    // Update state to simulate progress
    await db('puzzle_sessions')
      .where({ session_id: result1.sessionId })
      .update({ state: JSON.stringify(['AB', 'CD']) })

    // Try to get/create again - should return existing, NOT reset
    const result2 = await SessionService.getOrCreateSession(userId, 1)
    expect(result2.isNew).toBe(false)
    expect(result2.sessionId).toBe(result1.sessionId)

    // Verify state was NOT reset
    const session = await db('puzzle_sessions').where({ session_id: result1.sessionId }).first()
    expect(session.state).toBe(JSON.stringify(['AB', 'CD']))
  })

  it('getOrCreateSession should find existing session for anonymous user', async () => {
    const anonymousId = 'anon-test-123'

    // Create first session
    const result1 = await SessionService.getOrCreateSession(null, 1, anonymousId)
    expect(result1.isNew).toBe(true)

    // Try to get/create again - should return existing
    const result2 = await SessionService.getOrCreateSession(null, 1, anonymousId)
    expect(result2.isNew).toBe(false)
    expect(result2.sessionId).toBe(result1.sessionId)
  })

  it('getOrCreateSession should create new session when none exists', async () => {
    const userId = 999
    await db('users').insert({
      id: userId,
      username: 'testu4',
      password_hash: 'hash',
    })

    const result = await SessionService.getOrCreateSession(userId, 1)
    expect(result.isNew).toBe(true)
    expect(result.sessionId).toBeDefined()

    // Verify session was created
    const session = await db('puzzle_sessions').where({ session_id: result.sessionId }).first()
    expect(session).toBeDefined()
    expect(session.user_id).toBe(userId)
  })
})
