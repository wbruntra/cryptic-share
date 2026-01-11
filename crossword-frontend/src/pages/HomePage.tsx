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
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-surface rounded-xl animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {puzzles.map((puzzle) => {
              const status = puzzleStatus.get(puzzle.id)
              const isNavigating = navigating === puzzle.id

              return (
                <div
                  key={puzzle.id}
                  className="group bg-surface rounded-xl p-4 shadow-sm border border-border hover:border-primary hover:shadow-md transition-all duration-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-bold text-text group-hover:text-primary transition-colors">
                      {puzzle.title}
                    </h3>
                    {status === 'complete' && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/15 text-green-600 dark:text-green-400 font-medium">
                        ✓ Complete
                      </span>
                    )}
                    {status === 'in-progress' && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-primary/15 text-primary font-medium">
                        In Progress
                      </span>
                    )}
                  </div>

                  <button
                    onClick={() => handleGoToPuzzle(puzzle.id, puzzle.title)}
                    disabled={isNavigating}
                    className="w-full sm:w-auto py-2 px-6 rounded-lg font-bold transition-all shadow-sm active:scale-95 border-none cursor-pointer bg-primary text-white hover:bg-primary-hover disabled:opacity-60 disabled:cursor-wait"
                  >
                    {isNavigating ? 'Loading...' : 'Go to Puzzle'}
                  </button>
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
