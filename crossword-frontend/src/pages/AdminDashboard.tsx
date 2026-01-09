import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import type { PuzzleSummary } from '../types'
import { SkeletonPuzzleCard } from '../components/SkeletonLoader'

interface Session {
  session_id: string
  user_id: number | null
  anonymous_id: string | null
  puzzle_id: number
  username: string | null
  puzzle_title: string
}

export function AdminDashboard() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [puzzles, setPuzzles] = useState<PuzzleSummary[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(false)
  const [sessionsLoading, setSessionsLoading] = useState(false)
  const [userFilter, setUserFilter] = useState<string>('all')

  const fetchPuzzles = useCallback(() => {
    setLoading(true)
    axios
      .get('/api/puzzles')
      .then((res) => setPuzzles(res.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const fetchSessions = useCallback(() => {
    setSessionsLoading(true)
    axios
      .get('/api/admin/sessions')
      .then((res) => setSessions(res.data))
      .catch(console.error)
      .finally(() => setSessionsLoading(false))
  }, [])

  const checkAuth = useCallback(async () => {
    try {
      await axios.get('/api/check-auth')
      setIsAuthenticated(true)
      fetchPuzzles()
      fetchSessions()
    } catch {
      setIsAuthenticated(false)
    }
  }, [fetchPuzzles, fetchSessions])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    checkAuth()
  }, [checkAuth])

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this puzzle? This action cannot be undone.'))
      return
    try {
      await axios.delete(`/api/puzzles/${id}`)
      fetchPuzzles()
    } catch (error) {
      console.error('Failed to delete puzzle:', error)
      alert('Failed to delete puzzle.')
    }
  }

  const handleDeleteSession = async (sessionId: string) => {
    if (!confirm('Are you sure you want to delete this session? This action cannot be undone.'))
      return
    try {
      await axios.delete(`/api/admin/sessions/${sessionId}`)
      fetchSessions()
    } catch (error) {
      console.error('Failed to delete session:', error)
      alert('Failed to delete session.')
    }
  }

  const handleRename = async (id: number, currentTitle: string) => {
    const newTitle = prompt('Enter new title:', currentTitle)
    if (!newTitle || newTitle === currentTitle) return

    try {
      await axios.put(`/api/puzzles/${id}`, { title: newTitle })
      fetchPuzzles()
    } catch (error) {
      console.error('Failed to rename puzzle:', error)
      alert('Failed to rename puzzle.')
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoginError('')
    try {
      await axios.post('/api/login', { password })
      setIsAuthenticated(true)
      fetchPuzzles()
      fetchSessions()
    } catch {
      setLoginError('Invalid password')
    }
  }

  if (isAuthenticated === null)
    return (
      <div className="flex items-center justify-center min-h-[50vh] text-text-secondary animate-pulse gap-2">
        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
        Checking authorization...
      </div>
    )

  if (!isAuthenticated) {
    return (
      <div className="max-w-md mx-auto px-4 py-16">
        <div className="bg-surface p-8 rounded-2xl shadow-xl border border-border">
          <h1 className="text-3xl font-bold mb-6 text-center text-text italic tracking-tight">
            Admin Access
          </h1>
          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-sm font-semibold mb-2 text-text-secondary">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter admin password"
                className="w-full px-4 py-3 rounded-xl bg-input-bg border border-border text-text focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
              />
            </div>
            {loginError && (
              <div className="p-3 bg-error/10 border border-error/20 rounded-lg text-error text-sm text-center font-medium">
                {loginError}
              </div>
            )}
            <button
              type="submit"
              className="w-full py-3 px-6 rounded-xl bg-primary text-white font-bold shadow-md hover:bg-primary-hover transition-all active:scale-[0.98] border-none cursor-pointer"
            >
              Login
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 pb-12">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-10 pb-6 border-b border-border">
        <div>
          <h1 className="text-3xl font-bold text-text italic tracking-tight">Admin Dashboard</h1>
          <p className="text-text-secondary text-sm">Manage and create cryptic crosswords.</p>
        </div>
        <Link
          to="/create"
          className="w-full sm:w-auto px-6 py-3 rounded-xl bg-primary text-white font-bold shadow-md hover:bg-primary-hover hover:shadow-lg active:scale-95 transition-all text-center no-underline flex items-center justify-center gap-2"
        >
          <span className="text-xl">+</span> Create New Puzzle
        </Link>
      </header>

      <section>
        <h2 className="text-2xl font-bold mb-6 text-text border-l-4 border-primary pl-4">
          Manage Puzzles
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
                className="group bg-surface rounded-xl p-6 shadow-lg border border-border hover:border-primary transition-all duration-300"
              >
                <h3 className="text-xl font-bold mb-6 text-text group-hover:text-primary transition-colors min-h-[3rem] line-clamp-2">
                  {puzzle.title}
                </h3>
                <div className="space-y-3">
                  <Link
                    to={`/edit/${puzzle.id}`}
                    className="block w-full py-2 px-4 rounded-lg bg-input-bg border border-border text-text font-bold text-center no-underline hover:border-primary hover:text-primary transition-all"
                  >
                    Edit
                  </Link>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleRename(puzzle.id, puzzle.title)}
                      className="flex-1 py-2 px-4 rounded-lg bg-input-bg border border-border text-text-secondary text-sm font-medium hover:text-text hover:border-text transition-all border-none cursor-pointer"
                    >
                      Rename
                    </button>
                    <button
                      onClick={() => handleDelete(puzzle.id)}
                      className="flex-1 py-2 px-4 rounded-lg bg-error/10 border border-error/30 text-error text-sm font-medium hover:bg-error hover:text-white transition-all border-none cursor-pointer"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {puzzles.length === 0 && (
              <div className="col-span-full py-16 text-center bg-surface rounded-2xl border-2 border-dashed border-border shadow-inner">
                <p className="text-text-secondary italic">
                  No puzzles found. Click "Create New Puzzle" to get started.
                </p>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="mt-16">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <h2 className="text-2xl font-bold text-text border-l-4 border-primary pl-4">
            Manage Sessions
          </h2>
          <div className="w-full sm:w-auto">
            <label className="block text-sm font-semibold mb-2 text-text-secondary">
              Filter by User
            </label>
            <select
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
              className="w-full sm:w-64 px-4 py-2 rounded-lg bg-input-bg border border-border text-text focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
            >
              <option value="all">All Users ({sessions.length})</option>
              <option value="registered">
                Registered Users ({sessions.filter((s) => s.username).length})
              </option>
              <option value="anonymous">
                Anonymous Users ({sessions.filter((s) => !s.username && s.anonymous_id).length})
              </option>
              {Array.from(new Set(sessions.filter((s) => s.username).map((s) => s.username))).map(
                (username) => (
                  <option key={username} value={`user:${username}`}>
                    {username} ({sessions.filter((s) => s.username === username).length})
                  </option>
                ),
              )}
            </select>
          </div>
        </div>
        {sessionsLoading ? (
          <div className="flex items-center justify-center py-12 text-text-secondary gap-2">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
            Loading sessions...
          </div>
        ) : (
          <div className="bg-surface rounded-xl shadow-lg border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-input-bg border-b border-border">
                  <tr>
                    <th className="px-6 py-4 text-left text-sm font-bold text-text">Session ID</th>
                    <th className="px-6 py-4 text-left text-sm font-bold text-text">User</th>
                    <th className="px-6 py-4 text-left text-sm font-bold text-text">Puzzle</th>
                    <th className="px-6 py-4 text-right text-sm font-bold text-text">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {sessions
                    .filter((session) => {
                      if (userFilter === 'all') return true
                      if (userFilter === 'registered') return session.username !== null
                      if (userFilter === 'anonymous')
                        return session.username === null && session.anonymous_id !== null
                      if (userFilter.startsWith('user:')) {
                        const username = userFilter.substring(5)
                        return session.username === username
                      }
                      return true
                    })
                    .map((session) => (
                      <tr
                        key={session.session_id}
                        className="hover:bg-input-bg/30 transition-colors"
                      >
                        <td className="px-6 py-4 text-sm font-mono text-text-secondary">
                          {session.session_id}
                        </td>
                        <td className="px-6 py-4 text-sm text-text">
                          {session.username ? (
                            <span className="inline-flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-primary"></span>
                              <span className="font-medium">{session.username}</span>
                            </span>
                          ) : session.anonymous_id ? (
                            <span className="inline-flex items-center gap-2 text-text-secondary">
                              <span className="w-2 h-2 rounded-full bg-text-secondary"></span>
                              <span className="font-mono text-xs">
                                anon:{session.anonymous_id.substring(0, 8)}...
                              </span>
                            </span>
                          ) : (
                            <span className="text-text-secondary italic">Unknown</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm text-text">
                          {session.puzzle_title || (
                            <span className="text-text-secondary italic">Unknown</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => handleDeleteSession(session.session_id)}
                            className="px-4 py-2 rounded-lg bg-error/10 border border-error/30 text-error text-sm font-medium hover:bg-error hover:text-white transition-all border-none cursor-pointer"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {sessions.filter((session) => {
              if (userFilter === 'all') return true
              if (userFilter === 'registered') return session.username !== null
              if (userFilter === 'anonymous')
                return session.username === null && session.anonymous_id !== null
              if (userFilter.startsWith('user:')) {
                const username = userFilter.substring(5)
                return session.username === username
              }
              return true
            }).length === 0 && (
              <div className="py-16 text-center">
                <p className="text-text-secondary italic">No sessions found for this filter.</p>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
