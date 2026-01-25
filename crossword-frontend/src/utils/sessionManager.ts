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

export const clearLocalSessions = () => {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch (e) {
    console.error('Failed to clear local sessions', e)
  }
}

const ANON_ID_KEY = 'cryptic_share_anon_id'

export const getAnonymousId = (): string => {
  let anonId: string | null = null

  try {
    anonId = localStorage.getItem(ANON_ID_KEY)
  } catch (e) {
    console.error('Failed to read anonymous id from localStorage', e)
  }

  if (anonId) {
    console.log('[getAnonymousId] Reusing existing ID from localStorage:', anonId)
    return anonId
  }

  try {
    anonId = sessionStorage.getItem(ANON_ID_KEY)
  } catch (e) {
    console.error('Failed to read anonymous id from sessionStorage', e)
  }

  if (anonId) {
    console.log('[getAnonymousId] Reusing existing ID from sessionStorage:', anonId)
    return anonId
  }

  const generatedId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `anon-${Date.now()}-${Math.random()}`

  console.log('[getAnonymousId] Generated new anonymous ID:', generatedId)

  try {
    localStorage.setItem(ANON_ID_KEY, generatedId)
    console.log('[getAnonymousId] Persisted to localStorage')
  } catch (e) {
    console.error('Failed to persist anonymous id to localStorage', e)
    try {
      sessionStorage.setItem(ANON_ID_KEY, generatedId)
      console.log('[getAnonymousId] Persisted to sessionStorage instead')
    } catch (sessionError) {
      console.error('Failed to persist anonymous id to sessionStorage', sessionError)
    }
  }

  return generatedId
}
