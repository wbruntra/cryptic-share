import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import type { PuzzleSummary, RemoteSession } from '../types'
import { useAuth } from '../context/AuthContext'

import { getLocalSessions, saveLocalSession, getAnonymousId } from '../utils/sessionManager'

type PuzzleStatus = 'complete' | 'in-progress' | null

export function HomePage() {
  const [puzzles, setPuzzles] = useState<PuzzleSummary[]>([])
  const [puzzleStatus, setPuzzleStatus] = useState<Map<number, PuzzleStatus>>(new Map())
  const [loading, setLoading] = useState(false)
  const [navigating, setNavigating] = useState<number | null>(null)
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

  // Load puzzle status for badge display (best effort, not critical)
  useEffect(() => {
    const loadPuzzleStatus = async () => {
      try {
        const statusMap = new Map<number, PuzzleStatus>()
        if (user) {
          const remoteSessions = await refreshSessions()
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
        lastPlayed: Date.now(),
      })

      navigate(`/play/${sessionId}`)
    } catch (error) {
      console.error('Failed to go to puzzle:', error)
      alert('Failed to load puzzle')
      setNavigating(null)
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 pb-12">
      <section>
        <h2 className="text-2xl font-bold mb-6 text-text border-l-4 border-primary pl-4">
          Puzzles
        </h2>
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-48 bg-surface rounded-xl animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {puzzles.map((puzzle) => {
              const status = puzzleStatus.get(puzzle.id)
              const isNavigating = navigating === puzzle.id

              return (
                <div
                  key={puzzle.id}
                  className="group bg-surface rounded-xl p-6 shadow-lg border border-border hover:border-primary transition-all duration-300 flex flex-col justify-between"
                >
                  <div className="mb-4 flex items-center flex-wrap gap-3">
                    <h3 className="text-xl font-bold text-text group-hover:text-primary transition-colors">
                      {puzzle.title}
                    </h3>
                    <div className="flex gap-2">
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
            {puzzles.length === 0 && (
              <div className="col-span-full py-16 text-center bg-surface rounded-2xl border-2 border-dashed border-border shadow-inner">
                <p className="text-text-secondary italic">No puzzles found. Create one!</p>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
