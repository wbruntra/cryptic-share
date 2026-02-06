import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import axios from 'axios'
import { getAuthToken, setAuthToken, getMe } from '../../services/auth'
import type { PuzzleSummary } from '../../types'

export interface Session {
  session_id: string
  user_id: number | null
  anonymous_id: string | null
  puzzle_id: number
  username: string | null
  puzzle_title: string
  filled_letters: number
  created_at: string
}

export interface Report {
  id: number
  puzzle_id: number
  clue_number: number
  direction: string
  feedback: string
  reported_at: string
  answer: string
  clue_text: string
}

export interface ClueExplanation {
  puzzle_id: number
  clue_number: number
  direction: string
  clue_text: string
  answer: string
  explanation_json: string
  pending_reports: number
}

interface AdminState {
  isAuthenticated: boolean | null
  clueExplanations: ClueExplanation[]
  explanationStatus: 'idle' | 'loading' | 'succeeded' | 'failed'
  error: string | null
}

const initialState: AdminState = {
  isAuthenticated: null,
  clueExplanations: [],
  explanationStatus: 'idle',
  error: null,
}

// Thunks
export const checkAuth = createAsyncThunk('admin/checkAuth', async () => {
  try {
    const user = await getMe()
    // Check if user exists and has admin privileges
    if (user && user.isAdmin) {
      return true
    }
    return false
  } catch {
    return false
  }
})

export const login = createAsyncThunk(
  'admin/login',
  async ({ username, password }: { username: string; password: string }) => {
    const response = await axios.post('/api/auth/login', { username, password })
    if (response.data.token) {
      setAuthToken(response.data.token)
      // Verify the user is an admin
      const user = await getMe()
      if (!user || !user.isAdmin) {
        setAuthToken(null) // Clear the token if not admin
        throw new Error('Access denied: Admin privileges required')
      }
      return true
    }
    throw new Error('Invalid response from server')
  },
)

export const fetchClueExplanations = createAsyncThunk(
  'admin/fetchClueExplanations',
  async (puzzleId: string) => {
    const response = await axios.get(`/api/admin/explanations/${puzzleId}`)
    return response.data as ClueExplanation[]
  },
)

const adminSlice = createSlice({
  name: 'admin',
  initialState,
  reducers: {
    logout: (state) => {
      state.isAuthenticated = false
      state.clueExplanations = []
      setAuthToken(null) // Clear token on logout
    },
    clearError: (state) => {
      state.error = null
    },
  },
  extraReducers: (builder) => {
    builder
      // Check Auth
      .addCase(checkAuth.fulfilled, (state, action) => {
        state.isAuthenticated = action.payload
      })
      .addCase(checkAuth.rejected, (state) => {
        state.isAuthenticated = false
      })
      // Login
      .addCase(login.fulfilled, (state) => {
        state.isAuthenticated = true
        state.error = null
      })
      .addCase(login.rejected, (state, action) => {
        state.error = action.error.message || 'Login failed'
      })

      // Fetch Clue Explanations
      .addCase(fetchClueExplanations.pending, (state) => {
        state.explanationStatus = 'loading'
      })
      .addCase(fetchClueExplanations.fulfilled, (state, action) => {
        state.explanationStatus = 'succeeded'
        state.clueExplanations = action.payload
      })
      .addCase(fetchClueExplanations.rejected, (state, action) => {
        state.explanationStatus = 'failed'
        state.error = action.error.message || 'Failed to fetch explanations'
      })
  },
})

export const { logout, clearError } = adminSlice.actions
export default adminSlice.reducer
