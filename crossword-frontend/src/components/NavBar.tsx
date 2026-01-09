import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'

export function NavBar() {
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('theme') || 'dark'
  })
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const { user, logout } = useAuth()

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))
  }

  return (
    <nav className="bg-surface border-b border-border py-4 mb-8 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 flex justify-between items-center relative">
        <Link
          to="/"
          className="text-xl sm:text-2xl font-bold text-text no-underline hover:text-primary transition-colors"
        >
          Cryptic Share
        </Link>

        {/* Desktop nav */}
        <div className="hidden sm:flex items-center gap-6">
          <Link
            to="/"
            className="text-text-secondary no-underline font-medium hover:text-primary transition-colors"
          >
            Home
          </Link>
          <Link
            to="/admin"
            className="text-text-secondary no-underline font-medium hover:text-primary transition-colors"
          >
            Admin
          </Link>
          {user ? (
            <div className="flex items-center gap-4">
              <span className="text-text-secondary">{user.username}</span>
              <button
                onClick={logout}
                className="text-text-secondary hover:text-red-500 transition-colors"
              >
                Logout
              </button>
            </div>
          ) : (
            <Link
              to="/auth"
              className="text-text-secondary no-underline font-medium hover:text-primary transition-colors"
            >
              Login
            </Link>
          )}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg bg-input-bg border border-border hover:border-primary flex items-center justify-center transition-all"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>

        {/* Mobile menu button */}
        <div className="sm:hidden flex items-center">
          <button
            type="button"
            onClick={() => setIsMenuOpen((v) => !v)}
            className="p-2 rounded-lg bg-input-bg border border-border hover:border-primary flex items-center justify-center transition-all"
            aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={isMenuOpen}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {isMenuOpen ? (
                <>
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </>
              ) : (
                <>
                  <line x1="4" y1="6" x2="20" y2="6" />
                  <line x1="4" y1="12" x2="20" y2="12" />
                  <line x1="4" y1="18" x2="20" y2="18" />
                </>
              )}
            </svg>
          </button>
        </div>

        {/* Mobile popout */}
        {isMenuOpen && (
          <div className="sm:hidden absolute right-4 top-full mt-3 w-56 bg-surface border border-border rounded-xl shadow-lg overflow-hidden">
            <div className="flex flex-col">
              <Link
                to="/"
                onClick={() => setIsMenuOpen(false)}
                className="px-4 py-3 text-text no-underline hover:bg-input-bg transition-colors"
              >
                Home
              </Link>
              <Link
                to="/admin"
                onClick={() => setIsMenuOpen(false)}
                className="px-4 py-3 text-text no-underline hover:bg-input-bg transition-colors"
              >
                Admin
              </Link>
              <div className="border-t border-border" />
              {user ? (
                <div className="px-4 py-3 flex flex-col gap-2">
                  <span className="text-sm text-text-secondary">{user.username}</span>
                  <button
                    onClick={() => {
                      logout()
                      setIsMenuOpen(false)
                    }}
                    className="text-left text-text-secondary hover:text-red-500 transition-colors"
                  >
                    Logout
                  </button>
                </div>
              ) : (
                <Link
                  to="/auth"
                  onClick={() => setIsMenuOpen(false)}
                  className="px-4 py-3 text-text no-underline hover:bg-input-bg transition-colors"
                >
                  Login
                </Link>
              )}
              <div className="border-t border-border" />
              <button
                onClick={() => {
                  toggleTheme()
                  setIsMenuOpen(false)
                }}
                className="px-4 py-3 text-left text-text hover:bg-input-bg transition-colors"
                aria-label="Toggle theme"
              >
                Theme {theme === 'dark' ? '☀️' : '🌙'}
              </button>
            </div>
          </div>
        )}
      </div>
    </nav>
  )
}
