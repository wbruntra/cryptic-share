import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

export interface SocketState {
  isConnected: boolean
  socketId: string | null
  connectionError: string | null
  reconnectAttempts: number
  currentSessionId: string | null
}

const initialState: SocketState = {
  isConnected: false,
  socketId: null,
  connectionError: null,
  reconnectAttempts: 0,
  currentSessionId: null,
}

const socketSlice = createSlice({
  name: 'socket',
  initialState,
  reducers: {
    connectionEstablished: (state, action: PayloadAction<string>) => {
      state.isConnected = true
      state.socketId = action.payload
      state.connectionError = null
      state.reconnectAttempts = 0
    },
    connectionLost: (state) => {
      state.isConnected = false
      state.socketId = null
    },
    connectionError: (state, action: PayloadAction<string>) => {
      state.connectionError = action.payload
    },
    reconnectAttempt: (state, action: PayloadAction<number>) => {
      state.reconnectAttempts = action.payload
    },
    joinSession: (state, action: PayloadAction<string>) => {
      state.currentSessionId = action.payload
    },
    leaveSession: (state) => {
      state.currentSessionId = null
    },
  },
})

export const {
  connectionEstablished,
  connectionLost,
  connectionError,
  reconnectAttempt,
  joinSession,
  leaveSession,
} = socketSlice.actions

export default socketSlice.reducer
