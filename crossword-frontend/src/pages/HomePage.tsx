import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import type { PuzzleSummary, RemoteSession } from '../types'
import { useAuth } from '../context/AuthContext'

import { getLocalSessions, saveLocalSession, getAnonymousId } from '../utils/sessionManager'

type PuzzleStatus = 'complete' | 'in-progress' | null

interface PuzzleWithSession extends PuzzleSummary {
  session?: RemoteSession
}

const getTimestamp = () => Date.now()

export function HomePage() {
  const [puzzles, setPuzzles] = useState<PuzzleSummary[]>([])
  const [sessions, setSessions] = useState<RemoteSession[]>([])
  const [puzzleStatus, setPuzzleStatus] = useState<Map<number, PuzzleStatus>>(new Map())
  const [showCompleted, setShowCompleted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [navigating, setNavigating] = useState<number | null>(null)
  const navigate = useNavigate()
  const { user, refreshSessions, logout } = useAuth()

  useEffect(() => {
    axios
      .get('/api/puzzles')
      .then((res) => {
        if (Array.isArray(res.data)) {
          setPuzzles(res.data)
        } else {
          console.error('Unexpected puzzles response:', res.data)
          setPuzzles([])
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  // Load puzzle status for badge display (best effort, not critical)
  useEffect(() => {
    const loadPuzzleStatus = async () => {
      try {
        const statusMap = new Map<number, PuzzleStatus>()
        if (user) {
          const remoteSessions = await refreshSessions()
          setSessions(remoteSessions as RemoteSession[])
          for (const s of remoteSessions as RemoteSession[]) {
            statusMap.set(s.puzzle_id, s.is_complete ? 'complete' : 'in-progress')
          }
        } else {
          // For anonymous users, we only know if they started (no completion tracking)
          const localSessions = getLocalSessions()
          for (const s of localSessions) {
            statusMap.set(s.puzzleId, 'in-progress')
          }
        }
        setPuzzleStatus(statusMap)
      } catch (e) {
        console.error('Failed to load puzzle status', e)
      }
    }
    loadPuzzleStatus()
  }, [user, refreshSessions])

  const handleGoToPuzzle = async (puzzleId: number, puzzleTitle: string) => {
    setNavigating(puzzleId)
    try {
      const anonymousId = getAnonymousId()
      const res = await axios.post('/api/sessions/go', { puzzleId, anonymousId })
      const { sessionId } = res.data

      saveLocalSession({
        sessionId,
        puzzleId,
        puzzleTitle,
        lastPlayed: getTimestamp(),
      })

      navigate(`/play/${sessionId}`)
    } catch (error) {
      console.error('Failed to go to puzzle:', error)
      alert('Failed to load puzzle')
      setNavigating(null)
    }
  }

  const visiblePuzzles = puzzles.filter((puzzle) => {
    if (showCompleted) return true
    const status = puzzleStatus.get(puzzle.id)
    return status !== 'complete'
  })

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 pb-12">
      <section>
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-text border-l-4 border-primary pl-4">Puzzles</h2>
          <label className="flex items-center gap-2 cursor-pointer select-none text-text-secondary hover:text-text transition-colors">
            <input
              type="checkbox"
              checked={showCompleted}
              onChange={(e) => setShowCompleted(e.target.checked)}
              className="rounded border-border text-primary focus:ring-primary h-4 w-4"
            />
            <span className="text-sm font-medium">Show completed</span>
          </label>
        </div>
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-48 bg-surface rounded-xl animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {visiblePuzzles.map((puzzle) => {
              const status = puzzleStatus.get(puzzle.id)
              const isNavigating = navigating === puzzle.id
              const session = sessions.find((s) => s.puzzle_id === puzzle.id)

              return (
                <div
                  key={puzzle.id}
                  className="group bg-surface rounded-xl p-6 shadow-lg border border-border hover:border-primary transition-all duration-300 flex flex-col justify-between"
                >
                  <div className="mb-4 flex flex-col gap-3">
                    <h3 className="text-xl font-bold text-text group-hover:text-primary transition-colors">
                      {puzzle.title}
                    </h3>
                    <div className="flex gap-2 flex-wrap">
                      {status === 'complete' && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/15 text-green-600 dark:text-green-400 font-medium border border-green-500/20 whitespace-nowrap">
                          ✓ Complete
                        </span>
                      )}
                      {status === 'in-progress' && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-primary/15 text-primary font-medium border border-primary/20 whitespace-nowrap">
                          In Progress
                        </span>
                      )}
                    </div>

                    {/* Completion percentage */}
                    {session && typeof session.completion_pct === 'number' && (
                      <div>
                        <div className="flex justify-between text-xs text-gray-600 mb-1">
                          <span>Progress</span>
                          <span className="font-semibold">{session.completion_pct}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-blue-600 h-2 rounded-full transition-all"
                            style={{ width: `${session.completion_pct}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Owner info for friend sessions */}
                    {session &&
                      session.owner_username &&
                      session.owner_username !== user?.username && (
                        <div className="text-xs text-gray-500">
                          <span className="font-medium">Owner:</span> {session.owner_username}
                        </div>
                      )}
                  </div>

                  <button
                    onClick={() => handleGoToPuzzle(puzzle.id, puzzle.title)}
                    disabled={isNavigating}
                    className="w-full py-2.5 px-4 rounded-lg font-bold transition-all shadow-sm active:scale-95 border-none cursor-pointer bg-primary text-white hover:bg-primary-hover disabled:opacity-60 disabled:cursor-wait mt-auto"
                  >
                    {isNavigating ? 'Loading...' : 'Go to Puzzle'}
                  </button>
                </div>
              )
            })}
            {visiblePuzzles.length === 0 && (
              <div className="col-span-full py-16 text-center bg-surface rounded-2xl border-2 border-dashed border-border shadow-inner">
                <p className="text-text-secondary italic">
                  {puzzles.length > 0
                    ? 'No active puzzles found.'
                    : 'No puzzles found. Create one!'}
                </p>
              </div>
            )}
          </div>
        )}
      </section>

      {user && (
        <button
          onClick={logout}
          className="fixed bottom-6 right-6 opacity-30 hover:opacity-100 bg-surface border border-border text-text-secondary hover:text-red-500 hover:border-red-500/30 px-4 py-2 rounded-full shadow-lg transition-all duration-300 text-sm font-medium z-50 flex items-center gap-2"
        >
          <span>Logout</span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </button>
      )}
    </div>
  )
}
