import db from '../db-knex'

import {
  setCharAt,
  createEmptyState,
  migrateLegacyState,
  countFilledLetters,
  isSessionUntouched,
  mergeStates,
} from '../utils/stateHelpers'
import { FriendshipService } from './friendshipService'
import { getVerifiedCorrectState } from '../utils/answerChecker'

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

  /**
   * Merges two states of the same puzzle by first stripping each down to only
   * its verified-correct, fully-filled answers (via `getVerifiedCorrectState`).
   * Two verified-correct states can never disagree on a shared cell, so this
   * sidesteps conflict resolution entirely - any incomplete or wrong guesses on
   * either side are simply dropped rather than guessed at.
   */
  private static async mergeVerifiedStates(
    puzzleId: number,
    baseState: string[],
    overlayState: string[],
  ): Promise<string[]> {
    const [verifiedBase, verifiedOverlay] = await Promise.all([
      getVerifiedCorrectState(puzzleId, baseState),
      getVerifiedCorrectState(puzzleId, overlayState),
    ])
    return mergeStates(verifiedBase, verifiedOverlay)
  }

  /**
   * Finds a friend's session for a puzzle, if any (oldest one if multiple).
   */
  private static async findFriendSessionForPuzzle(
    userId: number,
    puzzleId: number,
    excludeSessionId?: string,
  ) {
    const friendIds = await FriendshipService.getFriendIds(userId)
    if (friendIds.length === 0) return null

    const query = db('puzzle_sessions')
      .where({ puzzle_id: puzzleId })
      .whereIn('user_id', friendIds)
      .orderBy('created_at', 'asc')

    if (excludeSessionId) {
      query.andWhereNot({ session_id: excludeSessionId })
    }

    return await query.first()
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

          // Merge only verified-correct, fully-filled answers from each side -
          // that guarantees no cell-level conflicts between the two states.
          const mergedState = await this.mergeVerifiedStates(
            anonymousSession.puzzle_id,
            userState,
            anonState,
          )

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
        // NO CONFLICT for this user's own sessions - but a friend may already have
        // a session for this puzzle. Join that instead of creating an orphan session,
        // merging in any progress made anonymously.
        const friendSession = await this.findFriendSessionForPuzzle(
          userId,
          anonymousSession.puzzle_id,
          anonymousSessionId,
        )

        if (friendSession) {
          try {
            const anonState = migrateLegacyState(JSON.parse(anonymousSession.state))
            if (countFilledLetters(anonState) > 0) {
              const friendState = migrateLegacyState(JSON.parse(friendSession.state))
              const mergedState = await this.mergeVerifiedStates(
                anonymousSession.puzzle_id,
                friendState,
                anonState,
              )
              const filledCount = countFilledLetters(mergedState)

              const puzzle = await db('puzzles')
                .where({ id: anonymousSession.puzzle_id })
                .select('letter_count')
                .first()
              const isComplete = puzzle?.letter_count != null && filledCount >= puzzle.letter_count

              await db('puzzle_sessions')
                .where({ session_id: friendSession.session_id })
                .update({
                  state: JSON.stringify(mergedState),
                  updated_at: now,
                  is_complete: isComplete,
                })
              this.cache.delete(friendSession.session_id)
            }

            await db('puzzle_sessions').where({ session_id: anonymousSessionId }).del()
            this.cache.delete(anonymousSessionId)
            count++
          } catch (e) {
            console.error(
              `Failed to merge anonymous session into friend's session for puzzle ${anonymousSession.puzzle_id}`,
              e,
            )
          }
        } else {
          // No conflict, no friend session either: just claim it
          await db('puzzle_sessions').where({ session_id: anonymousSessionId }).update({
            user_id: userId,
            updated_at: now,
          })
          count++
        }
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
   * 
   * If the user is logged in and has friends who have a session for this puzzle,
   * they will join the friend's session instead of creating a new one.
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
        // If this session is untouched, prefer joining a friend's session over
        // sitting on an orphan - this self-heals cases where an untouched session
        // got created for this user/puzzle before a friend's session was found
        // (e.g. via syncSessions, or a race between devices).
        if (isSessionUntouched(existingSession.state, existingSession.attributions)) {
          const friendSession = await this.findFriendSessionForPuzzle(
            userId,
            puzzleId,
            existingSession.session_id,
          )
          if (friendSession) {
            await db('puzzle_sessions').where({ session_id: existingSession.session_id }).del()
            this.cache.delete(existingSession.session_id)
            return { sessionId: friendSession.session_id, isNew: false }
          }
        }

        return { sessionId: existingSession.session_id, isNew: false }
      }

      // Check if any friend has a session for this puzzle
      const friendSession = await this.findFriendSessionForPuzzle(userId, puzzleId)
      if (friendSession) {
        // Join the friend's session by sharing the SAME session_id, rather than
        // creating a separate record for this user.
        return { sessionId: friendSession.session_id, isNew: false }
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
  // Map<sessionId, { state: string[], lastAccess: number, dirty: boolean, letter_count?: number | null, is_complete?: boolean }>
  private static cache = new Map<string, {
    state: string[]
    lastAccess: number
    dirty: boolean
    letter_count?: number | null
    is_complete?: boolean
  }>()
  private static saveTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private static pendingLoads = new Map<string, Promise<string[] | null>>()
  private static pendingInits = new Map<string, Promise<string[]>>()

  private static MAX_CACHE_SIZE = 1000
  private static CACHE_CLEANUP_THRESHOLD = 0.9

  private static evictCache() {
    if (this.cache.size < this.MAX_CACHE_SIZE) return

    // Calculate how many items to remove to reach threshold
    const targetSize = Math.floor(this.MAX_CACHE_SIZE * this.CACHE_CLEANUP_THRESHOLD)
    const itemsToRemove = this.cache.size - targetSize
    if (itemsToRemove <= 0) return

    // Get candidates (non-dirty entries)
    // We only evict non-dirty entries to avoid data loss
    const entries = Array.from(this.cache.entries())
    const candidates = entries.filter(([_, val]) => !val.dirty)

    // Sort by lastAccess (oldest first)
    candidates.sort((a, b) => a[1].lastAccess - b[1].lastAccess)

    // Remove oldest candidates
    const count = Math.min(itemsToRemove, candidates.length)
    for (let i = 0; i < count; i++) {
      this.cache.delete(candidates[i][0])
    }
  }

  private static setCache(
    sessionId: string,
    data: {
      state: string[]
      lastAccess: number
      dirty: boolean
      letter_count?: number | null
      is_complete?: boolean
    }
  ) {
    if (!this.cache.has(sessionId)) {
      this.evictCache()
    }
    this.cache.set(sessionId, data)
  }

  private static async getCachedOrLoad(sessionId: string): Promise<string[] | null> {
    const cached = this.cache.get(sessionId)
    if (cached) {
      cached.lastAccess = Date.now()
      return cached.state
    }

    let promise = this.pendingLoads.get(sessionId)
    if (!promise) {
      promise = (async () => {
        try {
          const session = await db('puzzle_sessions')
            .join('puzzles', 'puzzle_sessions.puzzle_id', 'puzzles.id')
            .where('puzzle_sessions.session_id', sessionId)
            .select('puzzle_sessions.*', 'puzzles.letter_count')
            .first()
          if (!session) return null

          let state: string[] = []
          try {
            const parsed = JSON.parse(session.state)
            state = migrateLegacyState(parsed)
          } catch (e) {
            console.error('Failed to parse session state', e)
          }

          this.setCache(sessionId, {
            state,
            lastAccess: Date.now(),
            dirty: false,
            letter_count: session.letter_count,
            is_complete: Boolean(session.is_complete),
          })
          return state
        } finally {
          this.pendingLoads.delete(sessionId)
        }
      })()
      this.pendingLoads.set(sessionId, promise)
    }

    return promise
  }

  static async getSessionState(sessionId: string): Promise<string[] | null> {
    return await this.getCachedOrLoad(sessionId)
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
          let letterCount = cached.letter_count
          let currentIsComplete = cached.is_complete

          // Lazy load if missing from cache
          if (letterCount === undefined || currentIsComplete === undefined) {
            const session = await db('puzzle_sessions')
              .join('puzzles', 'puzzle_sessions.puzzle_id', 'puzzles.id')
              .where('puzzle_sessions.session_id', sessionId)
              .select('puzzles.letter_count', 'puzzle_sessions.is_complete')
              .first()

            if (session) {
              letterCount = session.letter_count
              currentIsComplete = Boolean(session.is_complete)
              // Update cache
              cached.letter_count = letterCount
              cached.is_complete = currentIsComplete
            }
          }

          const isComplete = letterCount != null && filledCount >= letterCount

          // Only update is_complete if it changed
          const updateData: any = {
            state: JSON.stringify(cached.state),
            updated_at: now,
          }
          if (isComplete !== currentIsComplete) {
            updateData.is_complete = isComplete
            // Update cache to reflect new status
            cached.is_complete = isComplete
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
      let initPromise = this.pendingInits.get(sessionId)
      if (!initPromise) {
        initPromise = (async () => {
          const session = await db('puzzle_sessions')
            .join('puzzles', 'puzzle_sessions.puzzle_id', 'puzzles.id')
            .where('puzzle_sessions.session_id', sessionId)
            .select('puzzles.grid')
            .first()

          if (session && session.grid) {
            const rows = session.grid.split('\n').map((row: string) => row.trim().split(' '))
            const height = rows.length
            const width = rows[0].length
            const newState = createEmptyState(height, width)

            const cached = this.cache.get(sessionId)
            if (cached) cached.state = newState
            return newState
          } else {
            throw new Error('Cannot initialize session')
          }
        })().finally(() => {
          this.pendingInits.delete(sessionId)
        })
        this.pendingInits.set(sessionId, initPromise)
      }

      try {
        state = await initPromise
      } catch (err) {
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

  static async updateCells(
    sessionId: string,
    updates: Array<{ r: number; c: number; value: string }>
  ): Promise<void> {
    let state = await this.getCachedOrLoad(sessionId)
    if (!state) return // Session not found

    // Initialize state if empty (first edit)
    let needsInit = !Array.isArray(state) || state.length === 0
    if (!needsInit) {
      for (const update of updates) {
        if (!state[update.r]) {
          needsInit = true
          break
        }
      }
    }

    if (needsInit) {
      let initPromise = this.pendingInits.get(sessionId)
      if (!initPromise) {
        initPromise = (async () => {
          const session = await db('puzzle_sessions')
            .join('puzzles', 'puzzle_sessions.puzzle_id', 'puzzles.id')
            .where('puzzle_sessions.session_id', sessionId)
            .select('puzzles.grid')
            .first()

          if (session && session.grid) {
            const rows = session.grid.split('\n').map((row: string) => row.trim().split(' '))
            const height = rows.length
            const width = rows[0].length
            const newState = createEmptyState(height, width)

            const cached = this.cache.get(sessionId)
            if (cached) cached.state = newState
            return newState
          } else {
            throw new Error('Cannot initialize session')
          }
        })().finally(() => {
          this.pendingInits.delete(sessionId)
        })
        this.pendingInits.set(sessionId, initPromise)
      }

      try {
        state = await initPromise
      } catch (err) {
        return
      }
    }

    let changed = false
    for (const { r, c, value } of updates) {
      if (state && state[r] !== undefined) {
        state[r] = setCharAt(state[r], c, value || ' ')
        changed = true
      }
    }

    if (changed) {
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

    // Parse encrypted answers for frontend answer checking
    let answersEncrypted = null
    if (puzzle.answers_encrypted) {
      try {
        answersEncrypted = JSON.parse(puzzle.answers_encrypted)
      } catch (e) {
        console.error('Failed to parse answers_encrypted', e)
      }
    }

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
      this.setCache(sessionId, { state: sessionState, lastAccess: Date.now(), dirty: false })
    }

    // Parse attributions
    let attributions = {}
    try {
      attributions = JSON.parse(session.attributions || '{}')
    } catch (e) {
      console.error('Failed to parse attributions', e)
    }

    return {
      ...puzzle,
      puzzleId: puzzle.id,
      sessionState,
      answersEncrypted,
      attributions,
    }
  }

  static async updateSessionState(sessionId: string, state: any): Promise<boolean> {
    // legacy direct update
    const migratedState = migrateLegacyState(state)
    // Update cache
    this.setCache(sessionId, { state: migratedState, lastAccess: Date.now(), dirty: true })
    this.scheduleSave(sessionId)
    return true
  }

  /**
   * Get sessions for user and all their friends
   */
  static async getUserAndFriendsSessions(userId: number) {
    // Get friend IDs
    const friendIds = await FriendshipService.getFriendIds(userId)
    const allUserIds = [userId, ...friendIds]

    // Query sessions
    const sessions = await db('puzzle_sessions')
      .join('puzzles', 'puzzle_sessions.puzzle_id', 'puzzles.id')
      .leftJoin('users', 'puzzle_sessions.user_id', 'users.id')
      .whereIn('puzzle_sessions.user_id', allUserIds)
      .select(
        'puzzle_sessions.session_id',
        'puzzle_sessions.state',
        'puzzle_sessions.is_complete',
        'puzzle_sessions.user_id as owner_user_id',
        'users.username as owner_username',
        'puzzles.title as puzzle_title',
        'puzzles.id as puzzle_id',
        'puzzles.grid',
        'puzzles.letter_count',
      )
      .orderBy('puzzle_sessions.updated_at', 'desc')

    // Calculate completion percentage for each
    return sessions.map((s: any) => {
      // Only use the in-memory cache if it has unsaved (dirty) edits.
      // Otherwise read from the DB so that the HomePage reflects the
      // persisted truth (important after DB migrations/manual fixes).
      const cached = this.cache.get(s.session_id)
      let state: string[]
      if (cached && cached.dirty) {
        state = cached.state
        cached.lastAccess = Date.now()
      } else {
        state = migrateLegacyState(JSON.parse(s.state))
      }

      const filledCount = this.countFilledCells(state)
      // Use the puzzle's stored letter_count when available so the percentage
      // is computed with the same denominator used to set is_complete.
      const totalCount = s.letter_count != null
        ? Number(s.letter_count)
        : this.countTotalCells(s.grid)
      const completionPct = totalCount > 0 ? Math.round((filledCount / totalCount) * 100) : 0
      const isComplete = totalCount > 0 ? filledCount >= totalCount : Boolean(s.is_complete)

      return {
        session_id: s.session_id,
        puzzle_id: s.puzzle_id,
        puzzle_title: s.puzzle_title,
        state,
        is_complete: isComplete,
        owner_user_id: s.owner_user_id,
        owner_username: s.owner_username,
        filled_count: filledCount,
        total_count: totalCount,
        completion_pct: completionPct,
        grid: s.grid,
      }
    })
  }

  /**
   * Record word attribution (first correct completion wins)
   */
  static async recordWordAttribution(
    sessionId: string,
    clueKey: string,
    userId: number | null,
    username: string,
  ): Promise<boolean> {
    const session = await db('puzzle_sessions').where({ session_id: sessionId }).first()

    if (!session) {
      return false
    }

    // Parse existing attributions
    let attributions: Record<string, any> = {}
    try {
      attributions = JSON.parse(session.attributions || '{}')
    } catch (e) {
      console.error('Failed to parse attributions', e)
    }

    // Check if already claimed
    if (attributions[clueKey]) {
      return false // Already attributed
    }

    // Add attribution
    attributions[clueKey] = {
      userId,
      username,
      timestamp: new Date().toISOString(),
    }

    // Update DB
    await db('puzzle_sessions')
      .where({ session_id: sessionId })
      .update({
        attributions: JSON.stringify(attributions),
        updated_at: new Date().toISOString(),
      })

    return true // Successfully claimed
  }

  /**
   * Helper: Count filled cells in state
   */
  private static countFilledCells(state: string[]): number {
    return state.reduce((count, row) => {
      return count + row.split('').filter((ch) => ch !== ' ' && ch !== '').length
    }, 0)
  }

  /**
   * Helper: Count total playable cells from grid.
   * Only 'W' (white) and 'N' (numbered) cells are fillable; this matches
   * calculateLetterCount() in utils/stateHelpers.
   */
  private static countTotalCells(gridString: string): number {
    const rows = gridString.split('\n')
    let total = 0
    for (const row of rows) {
      const cells = row.trim().split(' ')
      for (const cell of cells) {
        if (cell === 'W' || cell === 'N') total++
      }
    }
    return total
  }

  // Admin methods
  static async getAllSessionsWithDetails() {
    try {
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
    } catch (error) {
      console.error('Error in getAllSessionsWithDetails:', error)
      throw error
    }
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
