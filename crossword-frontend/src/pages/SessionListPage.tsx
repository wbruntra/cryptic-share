import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'

interface Session {
  session_id: string
  user_id: number | null
  anonymous_id: string | null
  puzzle_id: number
  username: string | null
  puzzle_title: string
  filled_letters: number
  created_at: string
}

export function SessionListPage() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [userFilter, setUserFilter] = useState<string>('all')

  const fetchSessions = useCallback(() => {
    setLoading(true)
    axios
      .get('/api/admin/sessions')
      .then((res) => setSessions(res.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetchSessions()
  }, [fetchSessions])

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

  const formatTime = (isoString: string) => {
    if (!isoString) return '-'
    return new Date(isoString).toLocaleString()
  }

  const filteredSessions = sessions.filter((session) => {
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

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 pb-12">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-10 pb-6 border-b border-border pt-8">
        <div>
          <h1 className="text-3xl font-bold text-text italic tracking-tight">All Sessions</h1>
          <p className="text-text-secondary text-sm">
            View and manage all active game sessions. Sorted by creation date (newest first).
          </p>
        </div>
        <div className="flex gap-4">
           <Link
            to="/admin"
            className="px-6 py-3 rounded-xl bg-surface border-2 border-border text-text font-bold shadow-sm hover:border-primary hover:text-primary active:scale-95 transition-all text-center no-underline flex items-center justify-center gap-2"
          >
            Back to Dashboard
          </Link>
          <button
            onClick={fetchSessions}
            className="px-6 py-3 rounded-xl bg-primary text-white font-bold shadow-md hover:bg-primary-hover active:scale-95 transition-all border-none cursor-pointer"
          >
            Refresh
          </button>
        </div>
      </header>

      <div className="mb-6 flex justify-end">
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

      {loading ? (
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
                  <th className="px-6 py-4 text-left text-sm font-bold text-text">Created At</th>
                  <th className="px-6 py-4 text-left text-sm font-bold text-text">Session ID</th>
                  <th className="px-6 py-4 text-left text-sm font-bold text-text">User</th>
                  <th className="px-6 py-4 text-left text-sm font-bold text-text">Puzzle</th>
                  <th className="px-6 py-4 text-center text-sm font-bold text-text">Filled Letters</th>
                  <th className="px-6 py-4 text-right text-sm font-bold text-text">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredSessions.map((session) => (
                  <tr
                    key={session.session_id}
                    className="hover:bg-input-bg/30 transition-colors"
                  >
                     <td className="px-6 py-4 text-sm text-text-secondary whitespace-nowrap">
                      {formatTime(session.created_at)}
                    </td>
                    <td className="px-6 py-4 text-sm font-mono text-text-secondary">
                      <Link to={`/play/${session.session_id}`} className="hover:text-primary underline">
                        {session.session_id}
                      </Link>
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
                     <td className="px-6 py-4 text-sm text-text text-center font-mono">
                      {session.filled_letters}
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
          {filteredSessions.length === 0 && (
            <div className="py-16 text-center">
              <p className="text-text-secondary italic">No sessions found for this filter.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
