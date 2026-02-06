import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import axios from 'axios'
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
  await axios.get('/api/auth/check-auth')
  return true
})

export const login = createAsyncThunk('admin/login', async (password: string) => {
  await axios.post('/api/auth/admin-login', { password })
  return true
})

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
    },
    clearError: (state) => {
      state.error = null
    },
  },
  extraReducers: (builder) => {
    builder
      // Check Auth
      .addCase(checkAuth.fulfilled, (state) => {
        state.isAuthenticated = true
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
