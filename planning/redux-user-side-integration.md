# Redux Integration Plan for User-Side State Management

## Overview
Currently, the frontend uses Redux Toolkit (RTK) and RTK Query for admin features. We want to extend this pattern to user-facing features, starting with clue explanations to eliminate manual state management and improve data consistency.

## Current State

### Admin Side (Already Implemented)
- **RTK Query API**: `adminApi` for managing admin queries
  - Endpoints: reports, sessions, puzzles
  - Auto-caching, auto-refetching, optimistic updates
- **Redux Slice**: `adminSlice` for admin auth state
- **Store**: Configured with admin reducer and adminApi middleware

### User Side (Current Manual Approach)
- Heavy use of `useState` and `useCallback` in `PlaySession.tsx`
- Manual axios calls for:
  - Session data
  - Hint answers
  - Clue explanations (cached and generated)
  - Answer checking
  - Reporting explanations
- Socket events handled manually with `useEffect` hooks
- No centralized cache for explanations or hints

## Phase 1: Clue Explanations (Starting Point)

### Why Start with Explanations?
1. **Relatively isolated** - doesn't affect core gameplay immediately
2. **Clear API surface** - fetch cached, request new, report
3. **Socket integration** - good test case for async operations
4. **Reusable pattern** - can extend to hints next

### Current Explanation Flow
```typescript
// In PlaySession.tsx (~1122 lines)
const handleFetchExplanation = useCallback(async () => {
  const response = await axios.post(`/api/sessions/${sessionId}/explain`, {...})
  // Handle processing vs cached response
}, [cursor, currentClueNumber, sessionId])

const handleFetchCachedExplanation = useCallback(async () => {
  const response = await axios.post(`/api/sessions/${sessionId}/explain`, {
    cachedOnly: true
  })
  // Return cached or null
}, [cursor, currentClueNumber, sessionId])

const handleReportExplanation = useCallback(async (feedback) => {
  await axios.post(`/api/sessions/${sessionId}/report-explanation`, {...})
}, [cursor, currentClueNumber, sessionId])
```

### Proposed Structure

#### 1. Create Session API (`sessionApi.ts`)
```typescript
// src/store/api/sessionApi.ts
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'

export const sessionApi = createApi({
  reducerPath: 'sessionApi',
  baseQuery: fetchBaseQuery({ baseUrl: '/api/sessions' }),
  tagTypes: ['Session', 'Explanation', 'Hint'],
  endpoints: (builder) => ({
    // Clue Explanations
    getCachedExplanation: builder.query<ClueExplanation | null, {
      sessionId: string
      clueNumber: number
      direction: 'across' | 'down'
    }>({
      query: ({ sessionId, clueNumber, direction }) => ({
        url: `${sessionId}/explain`,
        method: 'POST',
        body: { clueNumber, direction, cachedOnly: true },
      }),
      providesTags: (result, error, arg) => [
        { type: 'Explanation', id: `${arg.clueNumber}-${arg.direction}` }
      ],
      transformErrorResponse: (response) => {
        // 404 means not cached - return null instead of error
        if (response.status === 404) return null
        return response
      },
    }),
    
    requestExplanation: builder.mutation<
      ClueExplanation | { processing: true; requestId: string; message: string },
      { sessionId: string; clueNumber: number; direction: 'across' | 'down' }
    >({
      query: ({ sessionId, clueNumber, direction }) => ({
        url: `${sessionId}/explain`,
        method: 'POST',
        body: { clueNumber, direction },
      }),
      invalidatesTags: (result, error, arg) => [
        { type: 'Explanation', id: `${arg.clueNumber}-${arg.direction}` }
      ],
    }),
    
    reportExplanation: builder.mutation<void, {
      sessionId: string
      clueNumber: number
      direction: 'across' | 'down'
      feedback?: string
    }>({
      query: ({ sessionId, clueNumber, direction, feedback }) => ({
        url: `${sessionId}/report-explanation`,
        method: 'POST',
        body: { clueNumber, direction, feedback },
      }),
    }),
  }),
})

export const {
  useGetCachedExplanationQuery,
  useRequestExplanationMutation,
  useReportExplanationMutation,
} = sessionApi
```

#### 2. Create Session Slice (`sessionSlice.ts`)
```typescript
// src/store/slices/sessionSlice.ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit'

interface PendingExplanation {
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
    removePendingExplanation: (state, action: PayloadAction<{ clueNumber: number; direction: 'across' | 'down' }>) => {
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
  clearSession 
} = sessionSlice.actions

export default sessionSlice.reducer
```

#### 3. Update Store Configuration
```typescript
// src/store/store.ts
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
    getDefaultMiddleware()
      .concat(adminApi.middleware)
      .concat(sessionApi.middleware),
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
```

#### 4. Update HintModal to Use Redux
```typescript
// In HintModal.tsx
import { useGetCachedExplanationQuery, useRequestExplanationMutation, useReportExplanationMutation } from '../store/api/sessionApi'

export function HintModal({ sessionId, clueNumber, direction, ... }: HintModalProps) {
  // Auto-fetch cached explanation with RTK Query
  const { data: cachedExplanation, isLoading: cachedLoading } = useGetCachedExplanationQuery(
    { sessionId, clueNumber, direction },
    { skip: activeTab !== 'explain' } // Only fetch when tab is active
  )

  const [requestExplanation, { isLoading: requestLoading }] = useRequestExplanationMutation()
  const [reportExplanation, { isLoading: reportLoading }] = useReportExplanationMutation()

  const handleFetchExplanation = async () => {
    const result = await requestExplanation({ sessionId, clueNumber, direction }).unwrap()
    if ('processing' in result) {
      // Handle async processing with socket
      dispatch(addPendingExplanation(result))
    }
  }

  // Socket listener for async completions
  useEffect(() => {
    if (!socket) return
    
    const handleExplanationReady = (data: any) => {
      // Invalidate cache to trigger refetch
      dispatch(sessionApi.util.invalidateTags([
        { type: 'Explanation', id: `${data.clueNumber}-${data.direction}` }
      ]))
      dispatch(removePendingExplanation({ clueNumber: data.clueNumber, direction: data.direction }))
    }
    
    socket.on('explanation_ready', handleExplanationReady)
    return () => { socket.off('explanation_ready', handleExplanationReady) }
  }, [socket, dispatch])
}
```

### Benefits of This Approach

1. **Automatic Caching**: RTK Query caches explanations by clue, avoiding duplicate requests
2. **Loading States**: Built-in `isLoading`, `isFetching`, `isError` states
3. **Optimistic Updates**: Can implement optimistic cache updates
4. **Normalized Data**: Consistent cache structure across components
5. **DevTools Integration**: Redux DevTools for debugging state changes
6. **Reduced Boilerplate**: No manual `useState` for loading/error/data
7. **Type Safety**: Full TypeScript support
8. **Cache Invalidation**: Easy to invalidate and refetch when needed

## Phase 2: Hints (Next Step)

Similar pattern for hints:
- `getHintAnswer` query endpoint
- Cache hints per clue
- Avoid redundant API calls

## Phase 3: Session State (More Complex)

Move session management to Redux:
- Session loading
- Grid state
- Answer checking
- Collaboration updates

### Challenges
- **Socket Integration**: Need to handle socket events updating Redux state
- **Local Storage Sync**: Session state syncs with localStorage
- **Performance**: Grid updates need to be fast (may keep some local state)

## Phase 4: Additional Features

- Puzzle list caching
- User profile state
- Push notification preferences

## Implementation Steps

### Step 1: Setup Infrastructure (30 min)
1. Create `src/store/api/sessionApi.ts`
2. Create `src/store/slices/sessionSlice.ts`
3. Update `src/store/store.ts`

### Step 2: Move Explanation Logic (1 hour)
1. Implement RTK Query endpoints for explanations
2. Update `HintModal.tsx` to use hooks
3. Remove manual axios calls from `PlaySession.tsx`
4. Test explanation fetching, caching, reporting

### Step 3: Socket Integration (30 min)
1. Connect socket events to Redux actions
2. Invalidate cache on `explanation_ready` event
3. Test async explanation completion

### Step 4: Testing & Refinement (30 min)
1. Test with network throttling
2. Verify cache behavior
3. Check error handling
4. Verify no infinite loops

### Step 5: Documentation (15 min)
1. Update AGENTS.md with Redux patterns
2. Document new hooks usage
3. Add examples for future features

## File Structure After Implementation

```
crossword-frontend/src/
├── store/
│   ├── api/
│   │   ├── adminApi.ts       (existing)
│   │   └── sessionApi.ts     (new - explanations, hints)
│   ├── slices/
│   │   ├── adminSlice.ts     (existing)
│   │   └── sessionSlice.ts   (new - session state)
│   ├── hooks.ts              (existing)
│   └── store.ts              (updated)
├── components/
│   └── HintModal.tsx         (updated to use RTK Query)
└── pages/
    └── PlaySession.tsx       (simplified, less manual state)
```

## Migration Strategy

1. **Incremental**: Add Redux alongside existing code
2. **Feature Flags**: Can toggle between old/new implementation
3. **Backwards Compatible**: No breaking changes to API contracts
4. **Testing**: Test each feature independently before removing old code

## Success Metrics

- [ ] Reduced lines of code in `PlaySession.tsx`
- [ ] Fewer `useState` and `useCallback` hooks
- [ ] No duplicate API requests for same explanation
- [ ] Faster perceived performance (cached data)
- [ ] Easier to add new features (follow RTK Query pattern)
- [ ] Better error handling and loading states

## Future Considerations

- **Offline Support**: RTK Query can work with persistence plugins
- **Optimistic Updates**: Can show immediate feedback before API response
- **Polling**: Auto-refresh explanations if needed
- **Prefetching**: Pre-load explanations for likely next clues
- **Cache Hydration**: Restore cache from localStorage on reload

## Notes

- Keep socket connection management in context (already good)
- Don't over-optimize - start simple with explanations
- Grid updates may stay local for performance
- Consider React Query as alternative if needed
