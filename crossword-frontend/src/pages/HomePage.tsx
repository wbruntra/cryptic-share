import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import axios from 'axios'
import type { PuzzleSummary } from '../types'
import { SkeletonPuzzleCard } from '../components/SkeletonLoader'
import { getLocalSessions, saveLocalSession, type LocalSession } from '../utils/sessionManager'

export function HomePage() {
  const [puzzles, setPuzzles] = useState<PuzzleSummary[]>([])
  const [recentSessions, setRecentSessions] = useState<LocalSession[]>([])
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    setLoading(true)
    axios
      .get('/api/puzzles')
      .then((res) => setPuzzles(res.data))
      .catch(console.error)
      .finally(() => setLoading(false))

    setRecentSessions(getLocalSessions())
  }, [])

  const handleStartSession = async (puzzleId: number, puzzleTitle: string) => {
    try {
      const res = await axios.post('/api/sessions', { puzzleId })
      const { sessionId } = res.data

      saveLocalSession({
        sessionId,
        puzzleId,
        puzzleTitle,
        lastPlayed: Date.now(),
      })

      navigate(`/play/${sessionId}`)
    } catch (error) {
      console.error('Failed to start session:', error)
      alert('Failed to start session')
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 pb-12">
      {recentSessions.length > 0 && (
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6 text-text border-l-4 border-primary pl-4">
            Continue Playing
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {recentSessions.map((session) => (
              <div
                key={session.sessionId}
                className="group bg-surface rounded-xl p-6 shadow-lg border border-border hover:border-primary transition-all duration-300 transform hover:-translate-y-1"
              >
                <h3 className="text-xl font-bold mb-2 text-text group-hover:text-primary transition-colors">
                  {session.puzzleTitle}
                </h3>
                <p className="text-sm text-text-secondary mb-6 flex items-center gap-2">
                  <span className="opacity-70">Last played:</span>
                  <span className="font-medium text-text">
                    {new Date(session.lastPlayed).toLocaleDateString()}
                  </span>
                </p>
                <div className="flex gap-4">
                  <Link
                    to={`/play/${session.sessionId}`}
                    className="flex-1 py-2 px-4 rounded-lg bg-primary text-white font-bold text-center no-underline hover:bg-primary-hover transition-all shadow-md active:scale-95"
                  >
                    Resume
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-2xl font-bold mb-6 text-text border-l-4 border-primary pl-4">
          Available Puzzles
        </h2>
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <SkeletonPuzzleCard key={i} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {puzzles.map((puzzle) => (
              <div
                key={puzzle.id}
                className="group bg-surface rounded-xl p-6 shadow-lg border border-border hover:border-primary transition-all duration-300 transform hover:-translate-y-1"
              >
                <h3 className="text-xl font-bold mb-4 text-text group-hover:text-primary transition-colors">
                  {puzzle.title}
                </h3>
                <div className="flex gap-4">
                  <button
                    onClick={() => handleStartSession(puzzle.id, puzzle.title)}
                    className="flex-1 py-2 px-4 rounded-lg bg-primary text-white font-bold hover:bg-primary-hover transition-all shadow-md active:scale-95 border-none cursor-pointer"
                  >
                    Play
                  </button>
                </div>
              </div>
            ))}
            {puzzles.length === 0 && (
              <div className="col-span-full py-12 text-center bg-surface rounded-xl border-2 border-dashed border-border">
                <p className="text-text-secondary italic">No puzzles found. Create one!</p>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
