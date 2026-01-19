import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { usePushNotifications } from '../hooks/usePushNotifications'

export function NavBar() {
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('theme') || 'dark'
  })
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isNotifPopoverOpen, setIsNotifPopoverOpen] = useState(false)
  const { user, logout } = useAuth()
  const { isSupported, isSubscribed, isLoading, subscribe, unsubscribe } = usePushNotifications()

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
          {/* {isSupported && (
            <div className="relative">
              <button
                onClick={() => setIsNotifPopoverOpen((v) => !v)}
                className={`p-2 rounded-lg border flex items-center justify-center transition-all ${
                  isSubscribed
                    ? 'bg-primary/10 border-primary text-primary'
                    : 'bg-input-bg border-border hover:border-primary text-text-secondary'
                }`}
                aria-label="Toggle notifications"
              >
                {isSubscribed ? '🔔' : '🔕'}
              </button>
              {isNotifPopoverOpen && (
                <div className="absolute right-0 top-full mt-2 w-64 bg-surface border border-border rounded-xl shadow-lg p-4 z-50">
                  <div className="text-sm text-text mb-3">
                    {isSubscribed
                      ? 'Push notifications enabled. Get notified when collaborators update puzzles.'
                      : 'Enable notifications to know when collaborators update shared puzzles.'}
                  </div>
                  <button
                    onClick={async () => {
                      if (isSubscribed) {
                        await unsubscribe()
                      } else {
                        await subscribe()
                      }
                      setIsNotifPopoverOpen(false)
                    }}
                    disabled={isLoading}
                    className={`w-full py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                      isSubscribed
                        ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20'
                        : 'bg-primary text-white hover:bg-primary/90'
                    } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {isLoading
                      ? 'Loading...'
                      : isSubscribed
                      ? 'Disable Notifications'
                      : 'Enable Notifications'}
                  </button>
                </div>
              )}
            </div>
          )} */}
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
              {isSupported && (
                <button
                  onClick={async () => {
                    if (isSubscribed) {
                      await unsubscribe()
                    } else {
                      await subscribe()
                    }
                    setIsMenuOpen(false)
                  }}
                  disabled={isLoading}
                  className="px-4 py-3 text-left text-text hover:bg-input-bg transition-colors flex items-center gap-2"
                >
                  {isSubscribed ? '🔔' : '🔕'}
                  <span>
                    {isLoading
                      ? 'Loading...'
                      : isSubscribed
                      ? 'Disable Notifications'
                      : 'Enable Notifications'}
                  </span>
                </button>
              )}
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
