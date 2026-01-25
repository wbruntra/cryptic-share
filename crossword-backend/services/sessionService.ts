import db from '../db-knex'

import {
  setCharAt,
  createEmptyState,
  migrateLegacyState,
  countFilledLetters,
} from '../utils/stateHelpers'

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
        'puzzle_sessions.is_complete',
        'puzzles.title',
        'puzzles.id as puzzle_id',
      )

    // Parse state for each session
    return sessions.map((s: any) => ({
      ...s,
      state: migrateLegacyState(JSON.parse(s.state)),
      is_complete: Boolean(s.is_complete),
    }))
  }

  static async syncSessions(userId: number, sessionIds: string[]): Promise<number> {
    const now = new Date().toISOString()
    let count = 0

    for (const anonymousSessionId of sessionIds) {
      // 1. Get the anonymous session
      const anonymousSession = await db('puzzle_sessions')
        .where({ session_id: anonymousSessionId })
        .first()

      // If it doesn't exist or already belongs to a user (any user), skip
      if (!anonymousSession || anonymousSession.user_id) {
        continue
      }

      // 2. Check for an existing session for this user and puzzle
      const userSession = await db('puzzle_sessions')
        .where({
          user_id: userId,
          puzzle_id: anonymousSession.puzzle_id,
        })
        .first()

      if (userSession) {
        // CONFLICT: Merge required
        try {
          const anonState = migrateLegacyState(JSON.parse(anonymousSession.state))
          const userState = migrateLegacyState(JSON.parse(userSession.state))

          // Merge: Anonymous takes precedence for non-empty cells
          // We assume dimensions match because it's the same puzzle
          const mergedState = [...userState]
          if (anonState.length > 0) {
            // Ensure mergedState is initialized if userState was empty
            if (mergedState.length === 0 && anonState.length > 0) {
              // If user state is empty, just take anon state
              mergedState.push(...anonState)
            } else {
              for (let r = 0; r < anonState.length; r++) {
                const anonRow = anonState[r]
                if (!anonRow) continue

                if (!mergedState[r]) mergedState[r] = ''
                for (let c = 0; c < anonRow.length; c++) {
                  const anonChar = anonRow[c]
                  // If anon has a letter (and it's not a space), overwrite
                  if (anonChar && anonChar.trim() !== '') {
                    mergedState[r] = setCharAt(mergedState[r], c, anonChar as string)
                  }
                }
              }
            }
          }

          // Update user session with merged state
          const filledCount = countFilledLetters(mergedState)
          
          // Get puzzle's letter_count for completion check
          const puzzle = await db('puzzles')
            .where({ id: anonymousSession.puzzle_id })
            .select('letter_count')
            .first()
            
          const isComplete = puzzle?.letter_count != null && filledCount >= puzzle.letter_count

          await db('puzzle_sessions')
            .where({ session_id: userSession.session_id })
            .update({
              state: JSON.stringify(mergedState),
              updated_at: now,
              is_complete: isComplete
            })

          // Invalidate cache for user session if it exists so next load gets merged state
          this.cache.delete(userSession.session_id)

          // Delete anonymous session
          await db('puzzle_sessions').where({ session_id: anonymousSessionId }).del()
          this.cache.delete(anonymousSessionId)

          count++
        } catch (e) {
          console.error(
            `Failed to reconcile sessions for user ${userId} and puzzle ${anonymousSession.puzzle_id}`,
            e,
          )
        }
      } else {
        // NO CONFLICT: Just claim it
        await db('puzzle_sessions').where({ session_id: anonymousSessionId }).update({
          user_id: userId,
          updated_at: now,
        })
        count++
      }
    }

    return count
  }

  static async createOrResetSession(
    userId: number | null,
    puzzleId: number,
    anonymousId?: string,
  ): Promise<string> {
    const initialState = '[]'
    const now = new Date().toISOString()

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
          updated_at: now,
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
          updated_at: now,
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
      created_at: now,
      updated_at: now,
    })

    return sessionId
  }

  /**
   * Gets an existing session for the user/puzzle combo, or creates a new one.
   * This does NOT reset an existing session - it just returns it.
   * Used for the "Go to Puzzle" flow to avoid duplicate sessions across devices.
   */
  static async getOrCreateSession(
    userId: number | null,
    puzzleId: number,
    anonymousId?: string,
  ): Promise<{ sessionId: string; isNew: boolean }> {
    const initialState = '[]'
    const now = new Date().toISOString()

    // If user is logged in, check for existing session
    if (userId) {
      const existingSession = await db('puzzle_sessions')
        .where({
          user_id: userId,
          puzzle_id: puzzleId,
        })
        .first()

      if (existingSession) {
        return { sessionId: existingSession.session_id, isNew: false }
      }
    } else if (anonymousId) {
      // If user is anonymous, check for existing session with this anonymousId
      const existingSession = await db('puzzle_sessions')
        .where({
          puzzle_id: puzzleId,
          anonymous_id: anonymousId,
        })
        .whereNull('user_id')
        .first()

      if (existingSession) {
        return { sessionId: existingSession.session_id, isNew: false }
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
      created_at: now,
      updated_at: now,
    })

    return { sessionId, isNew: true }
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
          const now = new Date().toISOString()
          // Check for completion
          const filledCount = countFilledLetters(cached.state)

          // Get puzzle's letter_count for comparison
          const session = await db('puzzle_sessions')
            .join('puzzles', 'puzzle_sessions.puzzle_id', 'puzzles.id')
            .where('puzzle_sessions.session_id', sessionId)
            .select('puzzles.letter_count', 'puzzle_sessions.is_complete')
            .first()

          const isComplete = session?.letter_count != null && filledCount >= session.letter_count

          // Only update is_complete if it changed
          const updateData: any = {
            state: JSON.stringify(cached.state),
            updated_at: now,
          }
          if (isComplete !== Boolean(session?.is_complete)) {
            updateData.is_complete = isComplete
          }

          await db('puzzle_sessions').where({ session_id: sessionId }).update(updateData)
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

  // Admin methods
  static async getAllSessionsWithDetails() {
    const sessions = await db('puzzle_sessions')
      .leftJoin('users', 'puzzle_sessions.user_id', 'users.id')
      .leftJoin('puzzles', 'puzzle_sessions.puzzle_id', 'puzzles.id')
      .select(
        'puzzle_sessions.session_id',
        'puzzle_sessions.state',
        'puzzle_sessions.user_id',
        'puzzle_sessions.anonymous_id',
        'puzzle_sessions.puzzle_id',
        'puzzle_sessions.created_at',
        'puzzle_sessions.updated_at',
        'users.username',
        'puzzles.title as puzzle_title',
      )
      .orderBy('puzzle_sessions.created_at', 'desc')

    return sessions.map((s) => {
      let filled_letters = 0
      try {
        const parsed = JSON.parse(s.state)
        const migrated = migrateLegacyState(parsed)
        filled_letters = countFilledLetters(migrated)
      } catch (e) {
        // ignore parsing errors
      }

      // Return session without the full state object to save bandwidth
      const { state, ...rest } = s
      return {
        ...rest,
        filled_letters,
      }
    })
  }

  static async deleteSession(sessionId: string): Promise<boolean> {
    // Remove from cache if present
    this.cache.delete(sessionId)
    const saveTimer = this.saveTimers.get(sessionId)
    if (saveTimer) {
      clearTimeout(saveTimer)
      this.saveTimers.delete(sessionId)
    }

    // Delete from database
    const count = await db('puzzle_sessions').where({ session_id: sessionId }).del()
    return count > 0
  }
}
