import db from '../db-knex'

import { setCharAt, createEmptyState, migrateLegacyState } from '../utils/stateHelpers'

export class SessionService {
  static generateSessionId(length = 12) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    let result = ''
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return result
  }

  static async getUserSessions(userId: number) {
    const sessions = await db('puzzle_sessions')
      .join('puzzles', 'puzzle_sessions.puzzle_id', 'puzzles.id')
      .where({ user_id: userId })
      .select(
        'puzzle_sessions.session_id',
        'puzzle_sessions.state',
        'puzzles.title',
        'puzzles.id as puzzle_id',
      )

    // Parse state for each session
    return sessions.map((s: any) => ({
      ...s,
      state: migrateLegacyState(JSON.parse(s.state)),
    }))
  }

  static async syncSessions(userId: number, sessionIds: string[]): Promise<number> {
    // Update sessions that don't have a user_id yet
    const count = await db('puzzle_sessions')
      .whereIn('session_id', sessionIds)
      .whereNull('user_id')
      .update({ user_id: userId })

    return count
  }

  static async createOrResetSession(
    userId: number | null,
    puzzleId: number,
    anonymousId?: string,
  ): Promise<string> {
    const initialState = '[]'

    // If user is logged in, check for existing session
    if (userId) {
      const existingSession = await db('puzzle_sessions')
        .where({
          user_id: userId,
          puzzle_id: puzzleId,
        })
        .first()

      if (existingSession) {
        // Reset the existing session
        await db('puzzle_sessions').where({ session_id: existingSession.session_id }).update({
          state: initialState,
        })
        return existingSession.session_id
      }
    } else if (anonymousId) {
      // If user is anonymous, check for existing session with this anonymousId
      // IMPORTANT: Only check for sessions that are NOT already claimed by a user (user_id IS NULL).
      const existingSession = await db('puzzle_sessions')
        .where({
          puzzle_id: puzzleId,
          anonymous_id: anonymousId,
        })
        .whereNull('user_id')
        .first()

      if (existingSession) {
        // Reset the existing session
        await db('puzzle_sessions').where({ session_id: existingSession.session_id }).update({
          state: initialState,
        })
        return existingSession.session_id
      }
    }

    // Create new session
    const sessionId = this.generateSessionId()
    await db('puzzle_sessions').insert({
      session_id: sessionId,
      puzzle_id: puzzleId,
      state: initialState,
      user_id: userId,
      anonymous_id: anonymousId || null,
    })

    return sessionId
  }

  // In-memory cache for active sessions to reduce DB reads/writes
  // Map<sessionId, { state: string[], lastAccess: number, dirty: boolean }>
  private static cache = new Map<string, { state: string[]; lastAccess: number; dirty: boolean }>()
  private static saveTimers = new Map<string, ReturnType<typeof setTimeout>>()

  private static async getCachedOrLoad(sessionId: string): Promise<string[] | null> {
    const cached = this.cache.get(sessionId)
    if (cached) {
      cached.lastAccess = Date.now()
      return cached.state
    }

    const session = await db('puzzle_sessions').where({ session_id: sessionId }).first()
    if (!session) return null

    let state: string[] = []
    try {
      const parsed = JSON.parse(session.state)
      state = migrateLegacyState(parsed)
    } catch (e) {
      console.error('Failed to parse session state', e)
    }

    this.cache.set(sessionId, { state, lastAccess: Date.now(), dirty: false })
    return state
  }

  private static scheduleSave(sessionId: string) {
    if (this.saveTimers.has(sessionId)) return

    const timer = setTimeout(async () => {
      this.saveTimers.delete(sessionId)
      const cached = this.cache.get(sessionId)
      if (cached && cached.dirty) {
        try {
          await db('puzzle_sessions')
            .where({ session_id: sessionId })
            .update({ state: JSON.stringify(cached.state) })
          cached.dirty = false
        } catch (e) {
          console.error('Failed to save session state to DB', sessionId, e)
        }
      }
    }, 1000) // 1 second debounce

    this.saveTimers.set(sessionId, timer)
  }

  static async updateCell(sessionId: string, r: number, c: number, value: string): Promise<void> {
    let state = await this.getCachedOrLoad(sessionId)
    if (!state) return // Session not found

    // Initialize state if empty (first edit)
    if (!Array.isArray(state) || state.length === 0 || !state[r]) {
      // Fetch puzzle dimensions to initialize
      // We need to fetch the puzzle associated with this session
      const session = await db('puzzle_sessions')
        .join('puzzles', 'puzzle_sessions.puzzle_id', 'puzzles.id')
        .where('puzzle_sessions.session_id', sessionId)
        .select('puzzles.grid')
        .first()

      if (session && session.grid) {
        const rows = session.grid.split('\n').map((row: string) => row.trim().split(' '))
        const height = rows.length
        const width = rows[0].length
        // Initializing with space-filled strings
        state = createEmptyState(height, width)

        // Update cache reference
        const cached = this.cache.get(sessionId)
        if (cached) cached.state = state
      } else {
        // Can't initialize
        return
      }
    }

    // Now state is string[]
    if (state && state[r] !== undefined) {
      // Use helper to set char
      state[r] = setCharAt(state[r], c, value || ' ')

      // Mark dirty and schedule save
      const cached = this.cache.get(sessionId)
      if (cached) {
        cached.dirty = true
        this.scheduleSave(sessionId)
      }
    }
  }

  static async getSessionWithPuzzle(sessionId: string) {
    const session: any = await db('puzzle_sessions').where({ session_id: sessionId }).first()

    if (!session) {
      return null
    }

    const puzzle: any = await db('puzzles').where({ id: session.puzzle_id }).first()

    if (!puzzle) {
      return null
    }

    puzzle.clues = JSON.parse(puzzle.clues)

    // Use cached state if available (it might be newer than DB)
    const cached = this.cache.get(sessionId)
    let sessionState
    if (cached) {
      sessionState = cached.state
      cached.lastAccess = Date.now()
    } else {
      const parsed = JSON.parse(session.state)
      sessionState = migrateLegacyState(parsed)
      // Populate cache
      this.cache.set(sessionId, { state: sessionState, lastAccess: Date.now(), dirty: false })
    }

    return {
      ...puzzle,
      sessionState,
    }
  }

  static async updateSessionState(sessionId: string, state: any): Promise<boolean> {
    // legacy direct update
    const migratedState = migrateLegacyState(state)
    // Update cache
    this.cache.set(sessionId, { state: migratedState, lastAccess: Date.now(), dirty: true })
    this.scheduleSave(sessionId)
    return true
  }
}
