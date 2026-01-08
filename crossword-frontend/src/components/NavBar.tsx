import { Link } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'

export function NavBar() {
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('theme') || 'dark'
  })
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
      <div className="max-w-7xl mx-auto px-4 sm:px-8 flex justify-between items-center">
        <Link
          to="/"
          className="text-2xl font-bold text-text no-underline hover:text-primary transition-colors"
        >
          Cryptic Share
        </Link>
        <div className="flex items-center gap-6">
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
      </div>
    </nav>
  )
}
