import db from '../db-knex'

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
      state: JSON.parse(s.state),
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

  static async createOrResetSession(userId: number | null, puzzleId: number): Promise<string> {
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
    }

    // Create new session
    const sessionId = this.generateSessionId()
    await db('puzzle_sessions').insert({
      session_id: sessionId,
      puzzle_id: puzzleId,
      state: initialState,
      user_id: userId,
    })

    return sessionId
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

    return {
      ...puzzle,
      sessionState: JSON.parse(session.state),
    }
  }

  static async updateSessionState(sessionId: string, state: any): Promise<boolean> {
    const updated = await db('puzzle_sessions')
      .where({ session_id: sessionId })
      .update({ state: JSON.stringify(state) })

    return updated > 0
  }
}
