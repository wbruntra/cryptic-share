import { useEffect, useRef, useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useSocket } from '@/context/SocketContext'
import {
  syncFromServer,
  updateCell,
  loadSessionStart,
  loadSessionSuccess,
  loadSessionError,
  setAttribution,
  addChangedCells,
} from '@/store/slices/puzzleSlice'
import type { AppDispatch, RootState } from '@/store/store'
import axios from 'axios'
import { getLocalSessionById, saveLocalSession, type LocalSession } from '@/utils/sessionManager'

const SYNC_DEBOUNCE_MS = 5000

export function usePuzzleSync(sessionId: string | undefined) {
  const dispatch = useDispatch<AppDispatch>()
  const { isConnected, send, on, off, socketId } = useSocket()
  const hasJoinedRef = useRef(false)
  const puzzle = useSelector((state: RootState) => state.puzzle)

  // Sync tracking
  const syncInProgress = useRef(false)
  const pendingSync = useRef(false)
  const lastSyncTime = useRef(0)

  // Load session data (Network first, then Local)
  useEffect(() => {
    if (!sessionId) return

    // Check if we already have this session loaded in Redux to avoid re-fetching on small re-renders
    if (puzzle.sessionId === sessionId && puzzle.grid.length > 0) {
      return
    }

    dispatch(loadSessionStart())

    const loadSession = async () => {
      // 1. Try Network
      try {
        const response = await axios.get(`/api/sessions/${sessionId}`)
        const data = response.data

        dispatch(
          loadSessionSuccess({
            ...data,
            sessionId,
          }),
        )

        // Save to local storage as backup
        saveLocalSession({
          sessionId,
          puzzleId: data.puzzleId,
          puzzleTitle: data.title,
          lastPlayed: Date.now(),
          lastKnownState: data.sessionState,
          puzzleData: {
            grid: data.grid,
            clues: data.clues,
            answersEncrypted: data.answersEncrypted,
            attributions: data.attributions,
          },
        })
        return
      } catch (err) {
        console.warn('Failed to load from server, checking local storage', err)
      }

      // 2. Fallback to Local Storage
      const localSession = getLocalSessionById(sessionId)
      if (localSession && localSession.lastKnownState && localSession.puzzleData) {
        // We have enough data to load offline!
        dispatch(
          loadSessionSuccess({
            grid: localSession.puzzleData.grid,
            clues: localSession.puzzleData.clues,
            title: localSession.puzzleTitle,
            sessionState: localSession.lastKnownState,
            sessionId,
            puzzleId: localSession.puzzleId,
            answersEncrypted: localSession.puzzleData.answersEncrypted,
            attributions: localSession.puzzleData.attributions,
          }),
        )
        // Note: we don't return here because we might want to try re-syncing via socket later?
        // But loadSession is done.
      } else {
        dispatch(loadSessionError('Failed to load puzzle'))
      }
    }

    loadSession()
  }, [sessionId, dispatch]) // remove puzzle dependency to avoid loops, handled inside

  // Join session via socket
  useEffect(() => {
    // We allow joining even if we are not "fully" loaded, but usually we wait for loadSessionSuccess
    if (!isConnected || !sessionId || hasJoinedRef.current) return

    send({ type: 'join_session', sessionId })
    hasJoinedRef.current = true
  }, [isConnected, sessionId, send])

  // Reset join state on disconnect
  useEffect(() => {
    if (!isConnected) {
      hasJoinedRef.current = false
    }
  }, [isConnected])

  // Register socket handlers
  useEffect(() => {
    if (!isConnected) return

    const handlers = {
      puzzle_updated: (data: { state?: string[] } | string[]) => {
        const state = Array.isArray(data) ? data : data?.state
        if (Array.isArray(state)) {
          dispatch(syncFromServer(state))

          // Update local storage
          if (sessionId) {
            const local = getLocalSessionById(sessionId)
            if (local) {
              saveLocalSession({ ...local, lastKnownState: state })
            }
          }
        }
      },

      cell_updated: (data: { r: number; c: number; value: string; senderId?: string }) => {
        // Ignore our own updates (we applied them optimistically)
        if (data.senderId === socketId) return

        const value = data.value || ' '
        dispatch(
          updateCell({
            r: data.r,
            c: data.c,
            value,
          }),
        )
        dispatch(addChangedCells([`${data.r}-${data.c}`]))
      },
      word_claimed: (data: {
        clueKey: string
        userId: number | null
        username: string
        timestamp: string
      }) => {
        dispatch(
          setAttribution({
            clueKey: data.clueKey,
            userId: data.userId,
            username: data.username,
            timestamp: data.timestamp,
          }),
        )
      },
    }

    Object.entries(handlers).forEach(([type, handler]) => {
      on(type, handler as (data: unknown) => void)
    })

    return () => {
      Object.entries(handlers).forEach(([type, handler]) => {
        off(type, handler as (data: unknown) => void)
      })
    }
  }, [isConnected, on, off, dispatch, socketId, sessionId])

  // Periodic sync (keep existing logic but maybe relax it)
  const performSync = useCallback(async () => {
    if (!sessionId || syncInProgress.current) {
      pendingSync.current = true
      return
    }

    const now = Date.now()
    if (now - lastSyncTime.current < SYNC_DEBOUNCE_MS) {
      return
    }

    syncInProgress.current = true

    try {
      const response = await axios.get(`/api/sessions/${sessionId}`)
      const serverState = response.data.sessionState

      if (serverState) {
        dispatch(syncFromServer(serverState))
      }
    } catch (err) {
      console.warn('[Sync] Failed (offline?)', err)
    } finally {
      syncInProgress.current = false
      lastSyncTime.current = Date.now()

      if (pendingSync.current) {
        pendingSync.current = false
        setTimeout(performSync, 100)
      }
    }
  }, [sessionId, dispatch])

  // Setup sync intervals
  useEffect(() => {
    if (!sessionId) return

    // Initial sync
    performSync()

    // Visibility sync only (no interval polling)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        performSync()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [performSync, sessionId])

  // Sync on reconnect
  useEffect(() => {
    if (isConnected && sessionId) {
      performSync()
    }
  }, [isConnected, sessionId, performSync])

  return {
    sendCellUpdate: (r: number, c: number, value: string) => {
      if (!sessionId) return

      // 1. Optimistic Update
      dispatch(updateCell({ r, c, value }))

      // 2. Update Local Storage
      try {
        const local = getLocalSessionById(sessionId)
        if (local && local.lastKnownState) {
          const state = [...local.lastKnownState]
          if (r >= 0 && r < state.length) {
            const row = state[r] || ''
            // Ensure row is long enough (pad if needed, though usually normalized)
            const paddedRow = row.padEnd(c + 1, ' ')
            const newRow = paddedRow.substring(0, c) + value + paddedRow.substring(c + 1)
            state[r] = newRow

            saveLocalSession({
              ...local,
              lastKnownState: state,
              lastPlayed: Date.now(),
            })
          }
        }
      } catch (e) {
        console.error('Failed to update local storage', e)
      }

      // 3. Send to Socket (if connected)
      if (isConnected) {
        send({
          type: 'update_cell',
          sessionId,
          r,
          c,
          value,
        })
      } else {
        // Fallback: Send to API directly?
        // Or queue for later?
        // For now, standard behavior is socket-only for writes.
        // If we want anonymous users to be able to play reliably, we might want an API fallback.
        // But `updateCell` via API exists in backend?
        // `routes/sessions.ts` -> `handleUpdateSession` (PUT /api/sessions/:id) takes `state` (full).
        // It doesn't seem to expose `updateCell` via HTTP.
        // Wait, `SocketService` calls `SessionService.updateCell`.
        // Backend `sessionRoutes.ts` does NOT have a specific `updateCell` endpoint.
        // Use `handleUpdateSession` with full state? Expensive.
      }
    },
  }
}
