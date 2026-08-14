import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { LuCheck, LuLogOut, LuLayoutGrid, LuList, LuChevronDown, LuChevronRight } from 'react-icons/lu'
import axios from 'axios'
import type { PuzzleSummary, RemoteSession, User } from '../types'
import { useAuth } from '../context/AuthContext'
import { MiniGrid } from '../components/MiniGrid'

import { getLocalSessions, saveLocalSession, getAnonymousId } from '../utils/sessionManager'
import type { LocalSession } from '../utils/sessionManager'

type PuzzleStatus = 'complete' | 'in-progress' | null

const getTimestamp = () => Date.now()

const HOME_CACHE_KEY = 'cryptic_share_home_cache_v1'

interface HeroData {
  kind: 'session' | 'new' | 'caught-up'
  puzzleId: number
  title: string
  grid?: string
  pct?: number
  ownerUsername?: string
  isOwn: boolean
}

interface StripItem {
  puzzleId: number
  title: string
  pct?: number
  ownerUsername?: string
  isOwn: boolean
}

interface HomeData {
  hero: HeroData | null
  strip: StripItem[]
}

function computeHomeData({
  puzzles,
  sessions,
  localSessions,
  user,
}: {
  puzzles: PuzzleSummary[]
  sessions: RemoteSession[]
  localSessions: LocalSession[]
  user: User | null
}): HomeData {
  const titleFor = (puzzleId: number) => puzzles.find((p) => p.id === puzzleId)?.title ?? 'Puzzle'

  if (user) {
    const incomplete = sessions.filter((s) => !s.is_complete)
    if (incomplete.length > 0) {
      const [top, ...rest] = incomplete
      return {
        hero: {
          kind: 'session',
          puzzleId: top.puzzle_id,
          title: titleFor(top.puzzle_id),
          grid: top.grid,
          pct: top.completion_pct,
          ownerUsername: top.owner_username,
          isOwn: !top.owner_username || top.owner_username === user.username,
        },
        strip: rest.slice(0, 4).map((s) => ({
          puzzleId: s.puzzle_id,
          title: titleFor(s.puzzle_id),
          pct: s.completion_pct,
          ownerUsername: s.owner_username,
          isOwn: !s.owner_username || s.owner_username === user.username,
        })),
      }
    }

    const unstarted = puzzles.find((p) => !sessions.some((s) => s.puzzle_id === p.id))
    if (unstarted) {
      return { hero: { kind: 'new', puzzleId: unstarted.id, title: unstarted.title, isOwn: true }, strip: [] }
    }

    return {
      hero: puzzles.length > 0 ? { kind: 'caught-up', puzzleId: -1, title: '', isOwn: true } : null,
      strip: [],
    }
  }

  // Anonymous users: no completion tracking, so any local session counts as "in progress"
  if (localSessions.length > 0) {
    const [top, ...rest] = localSessions
    return {
      hero: {
        kind: 'session',
        puzzleId: top.puzzleId,
        title: top.puzzleTitle,
        grid: top.puzzleData?.grid,
        isOwn: true,
      },
      strip: rest.slice(0, 4).map((s) => ({
        puzzleId: s.puzzleId,
        title: s.puzzleTitle,
        isOwn: true,
      })),
    }
  }

  const firstPuzzle = puzzles[0]
  if (firstPuzzle) {
    return { hero: { kind: 'new', puzzleId: firstPuzzle.id, title: firstPuzzle.title, isOwn: true }, strip: [] }
  }
  return { hero: null, strip: [] }
}

export function HomePage() {
  const [puzzles, setPuzzles] = useState<PuzzleSummary[]>([])
  const [sessions, setSessions] = useState<RemoteSession[]>([])
  const [puzzleStatus, setPuzzleStatus] = useState<Map<number, PuzzleStatus>>(new Map())
  const [showCompleted, setShowCompleted] = useState(() => {
    return localStorage.getItem('homeShowCompleted') === 'true'
  })
  const [loading, setLoading] = useState(true)
  const [statusLoading, setStatusLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [navigating, setNavigating] = useState<number | null>(null)
  const [viewMode, setViewMode] = useState<'card' | 'table'>(() => {
    return (localStorage.getItem('homeViewMode') as 'card' | 'table') || 'card'
  })
  const [showBrowseAll, setShowBrowseAll] = useState(() => {
    return localStorage.getItem('homeShowBrowseAll') === 'true'
  })
  const [selectedBook, setSelectedBook] = useState<string | null>(() => {
    return localStorage.getItem('homeSelectedBook')
  })
  const [cachedHome, setCachedHome] = useState<HomeData | null>(null)
  const [newPuzzleGridFor, setNewPuzzleGridFor] = useState<{ puzzleId: number; grid: string } | null>(null)
  const navigate = useNavigate()
  const { user, loading: authLoading, refreshSessions, logout } = useAuth()

  useEffect(() => {
    localStorage.setItem('homeViewMode', viewMode)
  }, [viewMode])

  useEffect(() => {
    localStorage.setItem('homeShowCompleted', String(showCompleted))
  }, [showCompleted])

  useEffect(() => {
    localStorage.setItem('homeShowBrowseAll', String(showBrowseAll))
  }, [showBrowseAll])

  useEffect(() => {
    if (selectedBook) localStorage.setItem('homeSelectedBook', selectedBook)
  }, [selectedBook])

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
      .catch((err) => {
        console.error('Failed to load puzzles:', err)
        setLoadError(true)
      })
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
      } finally {
        setStatusLoading(false)
      }
    }
    loadPuzzleStatus()
  }, [user, refreshSessions])

  // Hydrate from cache immediately so returning visitors don't see a loading state
  useEffect(() => {
    if (authLoading) return
    try {
      const raw = localStorage.getItem(HOME_CACHE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (parsed.userKey === (user?.username ?? 'anon')) {
        setCachedHome({ hero: parsed.hero, strip: parsed.strip })
      }
    } catch (e) {
      console.error('Failed to read home cache', e)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading])

  const isReady = !loading && !statusLoading
  const homeData = useMemo<HomeData | null>(() => {
    if (!isReady) return null
    return computeHomeData({
      puzzles,
      sessions,
      localSessions: user ? [] : getLocalSessions(),
      user,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, puzzles, sessions, user])

  useEffect(() => {
    if (!homeData) return
    try {
      localStorage.setItem(
        HOME_CACHE_KEY,
        JSON.stringify({ userKey: user?.username ?? 'anon', hero: homeData.hero, strip: homeData.strip }),
      )
    } catch (e) {
      console.error('Failed to write home cache', e)
    }
  }, [homeData, user])

  const displayedHome = homeData ?? cachedHome
  const hero = displayedHome?.hero ?? null

  // For a never-started puzzle we don't have the grid cached anywhere, so fetch just that one
  useEffect(() => {
    if (!hero || hero.kind !== 'new' || hero.grid) return
    if (newPuzzleGridFor?.puzzleId === hero.puzzleId) return
    let cancelled = false
    axios
      .get(`/api/puzzles/${hero.puzzleId}`)
      .then((res) => {
        if (!cancelled && res.data?.grid) {
          setNewPuzzleGridFor({ puzzleId: hero.puzzleId, grid: res.data.grid })
        }
      })
      .catch((e) => console.error('Failed to load puzzle preview', e))
    return () => {
      cancelled = true
    }
  }, [hero, newPuzzleGridFor])

  const heroGrid =
    hero?.grid ?? (hero?.kind === 'new' && newPuzzleGridFor?.puzzleId === hero.puzzleId ? newPuzzleGridFor.grid : undefined)

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

  const books = useMemo(() => {
    const set = new Set<string>()
    for (const p of puzzles) set.add(p.book ?? 'Unsorted')
    return Array.from(set).sort((a, b) => {
      const na = Number(a)
      const nb = Number(b)
      if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb
      return a.localeCompare(b)
    })
  }, [puzzles])

  const effectiveBook = selectedBook && books.includes(selectedBook) ? selectedBook : books[books.length - 1]

  const visiblePuzzles = puzzles.filter((puzzle) => {
    if ((puzzle.book ?? 'Unsorted') !== effectiveBook) return false
    if (showCompleted) return true
    const status = puzzleStatus.get(puzzle.id)
    return status !== 'complete'
  })

  const heroSubtitle =
    hero?.kind === 'new'
      ? 'Next up'
      : hero?.isOwn
        ? 'Continue where you left off'
        : `${hero?.ownerUsername} is working on this`

  const heroButtonLabel =
    navigating === hero?.puzzleId ? 'Loading...' : hero?.kind === 'new' ? 'Start Puzzle' : hero?.isOwn ? 'Resume Puzzle' : 'Join & Continue'

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 pb-12">
      {!displayedHome && (
        <div className="mb-8 h-48 bg-surface rounded-2xl animate-pulse" />
      )}

      {hero && hero.kind !== 'caught-up' && (
        <div className="mb-8 bg-surface rounded-2xl p-6 sm:p-8 shadow-lg border border-border flex flex-col sm:flex-row gap-6 sm:items-center">
          {heroGrid && (
            <div className="w-28 sm:w-36 flex-shrink-0 mx-auto sm:mx-0">
              <MiniGrid grid={heroGrid} />
            </div>
          )}
          <div className="flex-1 w-full text-center sm:text-left">
            <p className="text-sm font-semibold text-primary uppercase tracking-wide mb-1">{heroSubtitle}</p>
            <h2 className="text-2xl sm:text-3xl font-bold text-text mb-3">{hero.title}</h2>
            {typeof hero.pct === 'number' && (
              <div className="mb-4 max-w-xs mx-auto sm:mx-0">
                <div className="flex justify-between text-xs text-text-secondary mb-1">
                  <span>Progress</span>
                  <span className="font-semibold">{hero.pct}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${hero.pct}%` }} />
                </div>
              </div>
            )}
            <button
              onClick={() => handleGoToPuzzle(hero.puzzleId, hero.title)}
              disabled={navigating === hero.puzzleId}
              className="py-3 px-6 rounded-lg font-bold transition-all shadow-sm active:scale-95 border-none cursor-pointer bg-primary text-white hover:bg-primary-hover disabled:opacity-60 disabled:cursor-wait"
            >
              {heroButtonLabel}
            </button>
          </div>
        </div>
      )}

      {hero?.kind === 'caught-up' && (
        <div className="mb-8 text-center py-10 bg-surface rounded-2xl border-2 border-dashed border-border shadow-inner">
          <p className="text-text-secondary italic">You're all caught up! Browse all puzzles below to replay one.</p>
        </div>
      )}

      {displayedHome && displayedHome.strip.length > 0 && (
        <div className="mb-8">
          <h3 className="text-sm font-semibold text-text-secondary mb-3">Also in progress</h3>
          <div className="flex gap-3 flex-wrap">
            {displayedHome.strip.map((item) => (
              <button
                key={item.puzzleId}
                onClick={() => handleGoToPuzzle(item.puzzleId, item.title)}
                disabled={navigating === item.puzzleId}
                className="flex flex-col items-start gap-0.5 bg-surface border border-border rounded-lg px-4 py-2 hover:border-primary transition-colors text-left cursor-pointer disabled:opacity-60 disabled:cursor-wait"
              >
                <span className="text-sm font-semibold text-text">{item.title}</span>
                <span className="text-xs text-text-secondary">
                  {item.ownerUsername && !item.isOwn ? `${item.ownerUsername} · ` : ''}
                  {typeof item.pct === 'number' ? `${item.pct}%` : 'In progress'}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <section>
        <button
          onClick={() => setShowBrowseAll((v) => !v)}
          className="flex items-center gap-2 mb-6 bg-transparent border-none cursor-pointer p-0 text-text hover:text-primary transition-colors"
        >
          {showBrowseAll ? <LuChevronDown size={20} /> : <LuChevronRight size={20} />}
          <h2 className="text-xl font-bold border-l-4 border-primary pl-4">Browse all puzzles</h2>
        </button>

        {showBrowseAll && (
          <>
            {books.length > 1 && (
              <div className="flex gap-2 flex-wrap mb-4">
                {books.map((book) => (
                  <button
                    key={book}
                    onClick={() => setSelectedBook(book)}
                    className={`px-4 py-1.5 rounded-full text-sm font-semibold border transition-colors cursor-pointer ${
                      effectiveBook === book
                        ? 'bg-primary text-white border-primary'
                        : 'bg-surface text-text-secondary border-border hover:text-text hover:border-primary'
                    }`}
                  >
                    {book === 'Unsorted' ? book : `Book ${book}`}
                  </button>
                ))}
              </div>
            )}
            <div className="flex justify-end mb-6">
              <div className="flex flex-col sm:flex-row items-end sm:items-center gap-4">
                <div className="flex bg-surface border border-border rounded-lg overflow-hidden shadow-sm">
                  <button
                    onClick={() => setViewMode('card')}
                    className={`px-3 py-1.5 flex items-center justify-center transition-colors cursor-pointer border-none border-r border-border ${
                      viewMode === 'card'
                        ? 'bg-primary text-white'
                        : 'bg-transparent text-text-secondary hover:text-text hover:bg-input-bg'
                    }`}
                    aria-label="Card View"
                  >
                    <LuLayoutGrid size={18} />
                  </button>
                  <button
                    onClick={() => setViewMode('table')}
                    className={`px-3 py-1.5 flex items-center justify-center transition-colors cursor-pointer border-none ${
                      viewMode === 'table'
                        ? 'bg-primary text-white'
                        : 'bg-transparent text-text-secondary hover:text-text hover:bg-input-bg'
                    }`}
                    aria-label="Table View"
                  >
                    <LuList size={18} />
                  </button>
                </div>
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
            </div>
            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-48 bg-surface rounded-xl animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {viewMode === 'table' ? (
                  <div className="bg-surface rounded-xl shadow-lg border border-border overflow-hidden col-span-full">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-input-bg border-b border-border">
                          <tr>
                            <th className="px-6 py-4 text-left text-sm font-bold text-text">Puzzle</th>
                            <th className="px-6 py-4 text-left text-sm font-bold text-text">Status</th>
                            <th className="px-6 py-4 text-left text-sm font-bold text-text">Progress</th>
                            <th className="px-6 py-4 text-left text-sm font-bold text-text">Owner</th>
                            <th className="px-6 py-4 text-right text-sm font-bold text-text">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {visiblePuzzles.map((puzzle) => {
                            const status = puzzleStatus.get(puzzle.id)
                            const isNavigating = navigating === puzzle.id
                            const session = sessions.find((s) => s.puzzle_id === puzzle.id)

                            return (
                              <tr key={puzzle.id} className="hover:bg-input-bg/30 transition-colors">
                                <td className="px-6 py-4 text-sm font-bold text-text whitespace-nowrap">
                                  {puzzle.title}
                                </td>
                                <td className="px-6 py-4 text-sm whitespace-nowrap">
                                  {status === 'complete' && (
                                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/15 text-green-600 dark:text-green-400 font-medium border border-green-500/20">
                                      <LuCheck size={12} className="inline" /> Complete
                                    </span>
                                  )}
                                  {status === 'in-progress' && (
                                    <span className="text-xs px-2 py-0.5 rounded-full bg-primary/15 text-primary font-medium border border-primary/20">
                                      In Progress
                                    </span>
                                  )}
                                </td>
                                <td className="px-6 py-4 text-sm whitespace-nowrap">
                                  {session && typeof session.completion_pct === 'number' ? (
                                    <div className="w-24">
                                      <div className="flex justify-between text-xs text-gray-600 mb-1">
                                        <span>{session.completion_pct}%</span>
                                      </div>
                                      <div className="w-full bg-gray-200 rounded-full h-1.5">
                                        <div
                                          className="bg-blue-600 h-1.5 rounded-full transition-all"
                                          style={{ width: `${session.completion_pct}%` }}
                                        />
                                      </div>
                                    </div>
                                  ) : (
                                    <span className="text-text-secondary italic text-xs">-</span>
                                  )}
                                </td>
                                <td className="px-6 py-4 text-sm text-text-secondary whitespace-nowrap">
                                  {session && session.owner_username && session.owner_username !== user?.username ? (
                                    session.owner_username
                                  ) : (
                                    <span className="italic opacity-50">-</span>
                                  )}
                                </td>
                                <td className="px-6 py-4 text-right whitespace-nowrap">
                                  <button
                                    onClick={() => handleGoToPuzzle(puzzle.id, puzzle.title)}
                                    disabled={isNavigating}
                                    className="py-1.5 px-3 text-xs rounded-lg font-bold transition-all shadow-sm active:scale-95 border-none cursor-pointer bg-primary text-white hover:bg-primary-hover disabled:opacity-60 disabled:cursor-wait"
                                  >
                                    {isNavigating ? 'Loading...' : 'Go to Puzzle'}
                                  </button>
                                </td>
                              </tr>
                            )
                          })}
                          {visiblePuzzles.length === 0 && (
                            <tr>
                              <td colSpan={5} className="py-8 text-center text-text-secondary italic">
                                {loadError
                                  ? 'Unable to connect to the server. Please check your connection and try again.'
                                  : puzzles.length > 0
                                    ? 'No active puzzles found.'
                                    : 'No puzzles found. Create one!'}
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  visiblePuzzles.map((puzzle) => {
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
                  })
                )}
                {viewMode === 'card' && visiblePuzzles.length === 0 && (
                  <div className="col-span-full py-16 text-center bg-surface rounded-2xl border-2 border-dashed border-border shadow-inner">
                    <p className="text-text-secondary italic">
                      {loadError
                        ? 'Unable to connect to the server. Please check your connection and try again.'
                        : puzzles.length > 0
                          ? 'No active puzzles found.'
                          : 'No puzzles found. Create one!'}
                    </p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </section>

      {user && (
        <button
          onClick={logout}
          className="fixed bottom-6 right-6 opacity-30 hover:opacity-100 bg-surface border border-border text-text-secondary hover:text-red-500 hover:border-red-500/30 px-4 py-2 rounded-full shadow-lg transition-all duration-300 text-sm font-medium z-50 flex items-center gap-2"
        >
          <span>Logout</span>
          <LuLogOut size={16} />
        </button>
      )}
    </div>
  )
}
