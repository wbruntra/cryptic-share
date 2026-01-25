import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { SkeletonPuzzleCard } from '../components/SkeletonLoader'
import { useAppDispatch, useAppSelector } from '../store/hooks'
import { checkAuth, login, clearError } from '../store/slices/adminSlice'
import {
  useGetPuzzlesQuery,
  useDeletePuzzleMutation,
  useRenamePuzzleMutation,
} from '../store/api/adminApi'

export function AdminDashboard() {
  const dispatch = useAppDispatch()
  const { isAuthenticated, error } = useAppSelector((state) => state.admin)
  const { data: puzzles = [], isLoading: isPuzzlesLoading } = useGetPuzzlesQuery(undefined, {
    skip: !isAuthenticated,
  })
  const [deletePuzzle] = useDeletePuzzleMutation()
  const [renamePuzzle] = useRenamePuzzleMutation()

  const [password, setPassword] = useState('')

  useEffect(() => {
    dispatch(clearError())
    if (isAuthenticated === null) {
      dispatch(checkAuth())
    }
  }, [dispatch, isAuthenticated])

  const handleDelete = (id: number) => {
    if (!confirm('Are you sure you want to delete this puzzle? This action cannot be undone.'))
      return
    deletePuzzle(id)
  }

  const handleRename = (id: number, currentTitle: string) => {
    const newTitle = prompt('Enter new title:', currentTitle)
    if (!newTitle || newTitle === currentTitle) return

    renamePuzzle({ id, title: newTitle })
  }

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault()
    dispatch(login(password))
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
            {error && (
              <div className="p-3 bg-error/10 border border-error/20 rounded-lg text-error text-sm text-center font-medium">
                {error}
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
        <div className="flex gap-4 w-full sm:w-auto">
          <Link
            to="/admin/reports"
            className="flex-1 sm:flex-none px-6 py-3 rounded-xl bg-surface border-2 border-primary text-primary font-bold shadow-sm hover:bg-primary/5 hover:shadow-md active:scale-95 transition-all text-center no-underline flex items-center justify-center gap-2"
          >
            Manage Reports
          </Link>
          <Link
            to="/admin/sessions"
            className="flex-1 sm:flex-none px-6 py-3 rounded-xl bg-surface border-2 border-primary text-primary font-bold shadow-sm hover:bg-primary/5 hover:shadow-md active:scale-95 transition-all text-center no-underline flex items-center justify-center gap-2"
          >
            Manage Sessions
          </Link>
          <Link
            to="/create"
            className="flex-1 sm:flex-none px-6 py-3 rounded-xl bg-primary text-white font-bold shadow-md hover:bg-primary-hover hover:shadow-lg active:scale-95 transition-all text-center no-underline flex items-center justify-center gap-2"
          >
            <span className="text-xl">+</span> Create New Puzzle
          </Link>
        </div>
      </header>

      <section>
        <h2 className="text-2xl font-bold mb-6 text-text border-l-4 border-primary pl-4">
          Manage Puzzles
        </h2>
        {isPuzzlesLoading ? (
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
                  <Link
                    to={`/admin/puzzles/${puzzle.id}/explanations`}
                    className="block w-full py-2 px-4 rounded-lg bg-input-bg border border-border text-text-secondary text-sm font-medium text-center no-underline hover:text-text hover:border-text transition-all"
                  >
                    Review Explanations
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
    </div>
  )
}
