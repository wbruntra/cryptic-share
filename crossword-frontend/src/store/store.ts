import { configureStore } from '@reduxjs/toolkit'
import adminReducer from './slices/adminSlice'
import sessionReducer from './slices/sessionSlice'
import { adminApi } from './api/adminApi'
import { sessionApi } from './api/sessionApi'

export const store = configureStore({
  reducer: {
    admin: adminReducer,
    session: sessionReducer,
    [adminApi.reducerPath]: adminApi.reducer,
    [sessionApi.reducerPath]: sessionApi.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(adminApi.middleware).concat(sessionApi.middleware),
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
