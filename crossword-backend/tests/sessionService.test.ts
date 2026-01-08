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
      grid: '[]',
      clues: '[]',
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
})
