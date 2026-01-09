import React, { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import { AxiosError } from 'axios'

const AuthPage: React.FC = () => {
  const [isLogin, setIsLogin] = useState(true)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const { login, register } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      if (isLogin) {
        await login(username, password)
      } else {
        await register(username, password)
      }
      navigate('/')
    } catch (err) {
      if (err instanceof AxiosError && err.response) {
        setError(err.response.data.error || 'Authentication failed')
      } else {
        setError('Authentication failed')
      }
    }
  }

  return (
    <div className="max-w-md mx-auto mt-10 p-6 bg-surface border border-border rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-6 text-center text-text">
        {isLogin ? 'Login' : 'Register'}
      </h2>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-text-secondary text-sm font-bold mb-2">Username</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full px-3 py-2 bg-input-bg border-border text-text border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            required
          />
        </div>

        <div>
          <label className="block text-text-secondary text-sm font-bold mb-2">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 bg-input-bg border-border text-text border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            required
          />
        </div>

        <button
          type="submit"
          className="w-full bg-primary text-white py-2 rounded-md hover:bg-primary-hover transition-colors font-semibold"
        >
          {isLogin ? 'Login' : 'Create Account'}
        </button>
      </form>

      <div className="mt-4 text-center">
        <button
          onClick={() => setIsLogin(!isLogin)}
          className="text-primary hover:text-primary-hover text-sm"
        >
          {/* {isLogin ? 'Need an account? Register' : 'Already have an account? Login'} */}
        </button>
      </div>
    </div>
  )
}

export default AuthPage
