import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import axios from 'axios'

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
  clueExplanations: ClueExplanation[]
  explanationStatus: 'idle' | 'loading' | 'succeeded' | 'failed'
  error: string | null
}

const initialState: AdminState = {
  clueExplanations: [],
  explanationStatus: 'idle',
  error: null,
}

// Thunks
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
    clearError: (state) => {
      state.error = null
    },
  },
  extraReducers: (builder) => {
    builder
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

export const { clearError } = adminSlice.actions
export default adminSlice.reducer
