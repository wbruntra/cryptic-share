export interface LocalSession {
  sessionId: string
  puzzleId: number
  puzzleTitle: string
  lastPlayed: number
  lastKnownState?: string[]
}

const STORAGE_KEY = 'cryptic_share_sessions'

export const getLocalSessions = (): LocalSession[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return []
    return JSON.parse(stored).sort(
      (a: LocalSession, b: LocalSession) => b.lastPlayed - a.lastPlayed,
    )
  } catch (e) {
    console.error('Failed to parse local sessions', e)
    return []
  }
}

export const getLocalSessionById = (sessionId: string): LocalSession | undefined => {
  return getLocalSessions().find((s) => s.sessionId === sessionId)
}

export const saveLocalSession = (session: LocalSession) => {
  try {
    const sessions = getLocalSessions()
    const existingIndex = sessions.findIndex((s) => s.sessionId === session.sessionId)

    if (existingIndex >= 0) {
      sessions[existingIndex] = { ...sessions[existingIndex], ...session, lastPlayed: Date.now() }
    } else {
      sessions.push({ ...session, lastPlayed: Date.now() })
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions))
  } catch (e) {
    console.error('Failed to save local session', e)
  }
}

export const removeLocalSession = (sessionId: string) => {
  try {
    const sessions = getLocalSessions()
    const filtered = sessions.filter((s) => s.sessionId !== sessionId)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered))
  } catch (e) {
    console.error('Failed to remove local session', e)
  }
}

const ANON_ID_KEY = 'cryptic_share_anon_id'

export const getAnonymousId = (): string => {
  try {
    let anonId = localStorage.getItem(ANON_ID_KEY)
    if (!anonId) {
      anonId = crypto.randomUUID()
      localStorage.setItem(ANON_ID_KEY, anonId)
    }
    return anonId
  } catch (e) {
    console.error('Failed to get/set anonymous id', e)
    // Fallback for very old browsers or restrictive environments
    return `anon-${Date.now()}-${Math.random()}`
  }
}
