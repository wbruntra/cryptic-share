import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

export interface PendingExplanation {
  requestId: string
  clueNumber: number
  direction: 'across' | 'down'
  message: string
}

interface SessionState {
  currentSessionId: string | null
  pendingExplanations: Record<string, PendingExplanation> // key: `${clueNumber}-${direction}`
}

const initialState: SessionState = {
  currentSessionId: null,
  pendingExplanations: {},
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
    clearSession: (state) => {
      state.currentSessionId = null
      state.pendingExplanations = {}
    },
  },
})

export const {
  setCurrentSession,
  addPendingExplanation,
  removePendingExplanation,
  clearSession,
} = sessionSlice.actions

export default sessionSlice.reducer
