import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useGetPuzzlesMissingCluesQuery } from '../store/api/adminApi'

export function MissingCluesPage() {
  const { user, loading } = useAuth()
  const isAdmin = user?.isAdmin === true

  const { data: puzzles = [], isLoading } = useGetPuzzlesMissingCluesQuery(undefined, {
    skip: !isAdmin,
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] text-text-secondary animate-pulse gap-2">
        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
        Checking authorization...
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="max-w-md mx-auto mt-12 p-8 bg-error/10 border border-error/20 rounded-2xl text-error text-center font-medium">
        Admin access required.
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 pb-12">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8 pb-6 border-b border-border">
        <div>
          <h1 className="text-3xl font-bold text-text italic tracking-tight">Missing Clues Queue</h1>
          <p className="text-text-secondary text-sm">
            Puzzles with a grid but no usable clues yet.
          </p>
        </div>
        <Link
          to="/admin"
          className="px-6 py-2.5 rounded-xl bg-input-bg border border-border text-text-secondary font-bold hover:text-text hover:border-text transition-all text-center no-underline"
        >
          Back to Admin
        </Link>
      </header>

      {isLoading ? (
        <div className="text-text-secondary">Loading queue...</div>
      ) : puzzles.length === 0 ? (
        <div className="py-16 text-center bg-surface rounded-2xl border-2 border-dashed border-border shadow-inner">
          <p className="text-text-secondary italic">No puzzles currently missing clues 🎉</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {puzzles.map((puzzle) => (
            <div key={puzzle.id} className="bg-surface rounded-xl p-6 shadow-lg border border-border">
              <h3 className="text-lg font-bold mb-2 text-text">{puzzle.title}</h3>
              <p className="text-xs text-text-secondary mb-4">
                id: {puzzle.id}
                {puzzle.puzzle_number ? ` • #${puzzle.puzzle_number}` : ''}
                {puzzle.book ? ` • book ${puzzle.book}` : ''}
              </p>

              <Link
                to={`/admin/clues/${puzzle.id}`}
                className="block w-full py-2 px-4 rounded-lg bg-primary text-white font-bold text-center no-underline hover:bg-primary-hover transition-all"
              >
                Upload / Edit Clues
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
