import React, { createContext, useContext, useState, useEffect } from 'react'
import {
  login as apiLogin,
  register as apiRegister,
  logout as apiLogout,
  getMe,
  syncSessions,
  fetchUserSessions,
} from '../services/auth'
import type { User, RemoteSession } from '../types'

interface AuthContextType {
  user: User | null
  loading: boolean
  login: (u: string, p: string) => Promise<void>
  register: (u: string, p: string) => Promise<void>
  logout: () => void
  refreshSessions: () => Promise<RemoteSession[]>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const user = await getMe()
        setUser(user)
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    checkAuth()
  }, [])

  const login = async (u: string, p: string) => {
    const data = await apiLogin(u, p)
    setUser(data.user)
    await syncSessions()
  }

  const register = async (u: string, p: string) => {
    const data = await apiRegister(u, p)
    setUser(data.user)
    await syncSessions()
  }

  const logout = () => {
    apiLogout()
    setUser(null)
  }

  const refreshSessions = async (): Promise<RemoteSession[]> => {
    if (user) {
      return await fetchUserSessions()
    }
    return []
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshSessions }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
