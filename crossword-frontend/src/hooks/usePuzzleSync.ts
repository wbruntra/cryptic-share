import { useEffect, useRef, useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import {
  loadSessionStart,
  loadSessionSuccess,
  loadSessionError,
  syncFromServer,
  updateCell,
} from '@/store/slices/puzzleSlice'
import { joinSession, leaveSession } from '@/store/slices/socketSlice'
import type { AppDispatch, RootState } from '@/store/store'
import axios from 'axios'
import { getLocalSessionById, saveLocalSession } from '@/utils/sessionManager'

const SYNC_DEBOUNCE_MS = 5000

export function usePuzzleSync(sessionId: string | undefined) {
  const dispatch = useDispatch<AppDispatch>()
  const puzzle = useSelector((state: RootState) => state.puzzle)
  const socketState = useSelector((state: RootState) => state.socket)
  const { isConnected, socketId } = socketState

  const hasJoinedRef = useRef(false)

  const syncInProgress = useRef(false)
  const pendingSync = useRef(false)
  const lastSyncTime = useRef(0)

  useEffect(() => {
    if (!sessionId) return

    if (puzzle.sessionId === sessionId && puzzle.grid.length > 0) {
      return
    }

    dispatch(loadSessionStart())

    const loadSession = async () => {
      try {
        const response = await axios.get(`/api/sessions/${sessionId}`)
        const data = response.data

        dispatch(
          loadSessionSuccess({
            ...data,
            sessionId,
          }),
        )

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

      const localSession = getLocalSessionById(sessionId)
      if (localSession && localSession.lastKnownState && localSession.puzzleData) {
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
      } else {
        dispatch(loadSessionError('Failed to load puzzle'))
      }
    }

    loadSession()
  }, [sessionId, dispatch])

  useEffect(() => {
    if (!isConnected || !sessionId || hasJoinedRef.current) return

    dispatch(joinSession(sessionId))
    hasJoinedRef.current = true
  }, [isConnected, sessionId, dispatch])

  useEffect(() => {
    if (!isConnected) {
      hasJoinedRef.current = false
    }
  }, [isConnected])

  useEffect(() => {
    return () => {
      if (hasJoinedRef.current && sessionId) {
        dispatch(leaveSession())
      }
    }
  }, [sessionId, dispatch])

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

        const local = getLocalSessionById(sessionId)
        if (local) {
          saveLocalSession({ ...local, lastKnownState: serverState })
        }
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

  useEffect(() => {
    if (!sessionId) return

    performSync()

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

  useEffect(() => {
    if (isConnected && sessionId) {
      performSync()
    }
  }, [isConnected, sessionId, performSync])

  return {
    isConnected,
    socketId,
    sendCellUpdate: (r: number, c: number, value: string) => {
      if (!sessionId) return

      dispatch(updateCell({ r, c, value }))

      try {
        const local = getLocalSessionById(sessionId)
        if (local && local.lastKnownState) {
          const state = [...local.lastKnownState]
          if (r >= 0 && r < state.length) {
            const row = state[r] || ''
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

      if (isConnected) {
        // Send via REST API
        axios
          .post(`/api/sessions/${sessionId}/cell${socketId ? `?socketId=${socketId}` : ''}`, {
            r,
            c,
            value,
          })
          .catch((err) => {
            console.warn('[usePuzzleSync] Failed to send cell update via REST:', err)
          })
      }
    },
  }
}
