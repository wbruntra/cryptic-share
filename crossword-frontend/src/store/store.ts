import { configureStore } from '@reduxjs/toolkit'
import adminReducer from './slices/adminSlice'
import sessionReducer from './slices/sessionSlice'
import puzzleReducer from './slices/puzzleSlice'
import socketReducer from './slices/socketSlice'
import { adminApi } from './api/adminApi'
import { sessionApi } from './api/sessionApi'
import { socketMiddleware } from './middleware/socketMiddleware'

export const store = configureStore({
  reducer: {
    admin: adminReducer,
    session: sessionReducer,
    puzzle: puzzleReducer,
    socket: socketReducer,
    [adminApi.reducerPath]: adminApi.reducer,
    [sessionApi.reducerPath]: sessionApi.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware()
      .concat(adminApi.middleware)
      .concat(sessionApi.middleware)
      .concat(socketMiddleware),
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
