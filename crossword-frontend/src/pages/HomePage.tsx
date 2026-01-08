import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import axios from 'axios'
import type { PuzzleSummary, RemoteSession } from '../types'
import { useAuth } from '../context/AuthContext'

import {
  getLocalSessions,
  saveLocalSession,
  getAnonymousId,
  type LocalSession,
} from '../utils/sessionManager'

export function HomePage() {
  const [puzzles, setPuzzles] = useState<PuzzleSummary[]>([])
  const [recentSessions, setRecentSessions] = useState<LocalSession[]>([])
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const { user, refreshSessions } = useAuth()

  useEffect(() => {
    setLoading(true)
    axios
      .get('/api/puzzles')
      .then((res) => setPuzzles(res.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const loadSessions = async () => {
      if (user) {
        try {
          const remoteSessions = await refreshSessions()
          // Map to LocalSession format
          const mappedSessions: LocalSession[] = remoteSessions.map((s: RemoteSession) => ({
            sessionId: s.session_id,
            puzzleId: s.puzzle_id,
            puzzleTitle: s.title,
            lastPlayed: 0, // Backend doesn't store this yet
          }))
          setRecentSessions(mappedSessions)
        } catch (e) {
          console.error('Failed to load user sessions', e)
        }
      } else {
        setRecentSessions(getLocalSessions())
      }
    }
    loadSessions()
  }, [user, refreshSessions])

  const handleStartSession = async (
    puzzleId: number,
    puzzleTitle: string,
    hasExistingSession: boolean,
  ) => {
    if (hasExistingSession) {
      if (
        !window.confirm(
          'Are you sure you want to restart this puzzle? Your previous progress will be lost.',
        )
      ) {
        return
      }
    }

    try {
      const anonymousId = getAnonymousId()
      const res = await axios.post('/api/sessions', { puzzleId, anonymousId })
      const { sessionId } = res.data
      // eslint-disable-next-line react-hooks/purity
      const now = Date.now()

      saveLocalSession({
        sessionId,
        puzzleId,
        puzzleTitle,
        lastPlayed: now,
      })

      // If logged in, the session is already created with user_id by the backend (thanks to interceptor)
      // We just navigate.
      // Note: We might want to refresh the list if we come back, but for now just navigating.

      navigate(`/play/${sessionId}`)
    } catch (error) {
      console.error('Failed to start session:', error)
      alert('Failed to start session')
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 pb-12">
      <section>
        <h2 className="text-2xl font-bold mb-6 text-text border-l-4 border-primary pl-4">
          Puzzles
        </h2>
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-surface rounded-xl animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {puzzles.map((puzzle) => {
              const session = recentSessions.find((s) => s.puzzleId === puzzle.id)

              return (
                <div
                  key={puzzle.id}
                  className="group bg-surface rounded-xl p-4 shadow-sm border border-border hover:border-primary hover:shadow-md transition-all duration-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                >
                  <h3 className="text-lg font-bold text-text group-hover:text-primary transition-colors">
                    {puzzle.title}
                  </h3>

                  <div className="flex gap-3 w-full sm:w-auto">
                    {session && (
                      <Link
                        to={`/play/${session.sessionId}`}
                        className="flex-1 sm:flex-none py-2 px-6 rounded-lg bg-primary/10 text-primary font-bold text-center no-underline hover:bg-primary/20 transition-colors border border-primary/20"
                      >
                        Resume
                      </Link>
                    )}
                    <button
                      onClick={() => handleStartSession(puzzle.id, puzzle.title, !!session)}
                      className={`flex-1 sm:flex-none py-2 px-6 rounded-lg font-bold transition-all shadow-sm active:scale-95 border-none cursor-pointer ${
                        session
                          ? 'bg-surface-hover text-text-secondary hover:bg-border hover:text-text'
                          : 'bg-primary text-white hover:bg-primary-hover'
                      }`}
                    >
                      {session ? 'Reset' : 'Start'}
                    </button>
                  </div>
                </div>
              )
            })}
            {puzzles.length === 0 && (
              <div className="py-12 text-center bg-surface rounded-xl border-2 border-dashed border-border">
                <p className="text-text-secondary italic">No puzzles found. Create one!</p>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
