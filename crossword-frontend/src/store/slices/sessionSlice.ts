import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { socketReceivedExplanation } from '../actions/socketActions'

export interface PendingExplanation {
  requestId: string
  clueNumber: number
  direction: 'across' | 'down'
  message: string
}

export interface ReceivedExplanation {
  clueNumber: number
  direction: 'across' | 'down'
  explanation: Record<string, unknown> | null
  error: string | null
}

interface SessionState {
  currentSessionId: string | null
  pendingExplanations: Record<string, PendingExplanation>
  latestExplanation: ReceivedExplanation | null
}

const initialState: SessionState = {
  currentSessionId: null,
  pendingExplanations: {},
  latestExplanation: null,
}

const sessionSlice = createSlice({
  name: 'session',
  initialState,
  reducers: {
    setCurrentSession: (state, action: PayloadAction<string>) => {
      state.currentSessionId = action.payload
    },
    addPendingExplanation: (state, action: PayloadAction<PendingExplanation>) => {
      const key = `${action.payload.clueNumber}-${action.payload.direction}`
      state.pendingExplanations[key] = action.payload
    },
    removePendingExplanation: (
      state,
      action: PayloadAction<{ clueNumber: number; direction: 'across' | 'down' }>
    ) => {
      const key = `${action.payload.clueNumber}-${action.payload.direction}`
      delete state.pendingExplanations[key]
    },
    clearLatestExplanation: (state) => {
      state.latestExplanation = null
    },
    clearSession: (state) => {
      state.currentSessionId = null
      state.pendingExplanations = {}
      state.latestExplanation = null
    },
  },
  extraReducers: (builder) => {
    builder.addCase(socketReceivedExplanation, (state, action) => {
      const { clueNumber, direction, success, explanation, error } = action.payload
      const key = `${clueNumber}-${direction}`
      delete state.pendingExplanations[key]
      
      state.latestExplanation = {
        clueNumber,
        direction,
        explanation: success && explanation ? explanation : null,
        error: !success ? error || 'Failed to generate explanation' : null,
      }
    })
  },
})

export const {
  setCurrentSession,
  addPendingExplanation,
  removePendingExplanation,
  clearLatestExplanation,
  clearSession,
} = sessionSlice.actions

export default sessionSlice.reducer
