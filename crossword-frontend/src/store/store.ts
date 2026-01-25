import { configureStore } from '@reduxjs/toolkit'
import adminReducer from './slices/adminSlice'
import { adminApi } from './api/adminApi'

export const store = configureStore({
  reducer: {
    admin: adminReducer,
    [adminApi.reducerPath]: adminApi.reducer,
  },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(adminApi.middleware),
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
