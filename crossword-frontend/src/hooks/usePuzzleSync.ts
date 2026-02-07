import { useEffect, useRef, useCallback } from 'react'
import { useDispatch } from 'react-redux'
import { useSocket } from '@/context/SocketContext'
import { 
  syncFromServer, 
  updateCell,
  loadSessionStart,
  loadSessionSuccess,
  loadSessionError,
  setAttribution,
  addChangedCells,
  setCheckInProgress
} from '@/store/slices/puzzleSlice'
import type { AppDispatch } from '@/store/store'
import axios from 'axios'

const SYNC_DEBOUNCE_MS = 5000

export function usePuzzleSync(sessionId: string | undefined) {
  const dispatch = useDispatch<AppDispatch>()
  const { isConnected, send, on, off, socketId } = useSocket()
  const hasJoinedRef = useRef(false)
  
  // Sync tracking
  const syncInProgress = useRef(false)
  const pendingSync = useRef(false)
  const lastSyncTime = useRef(0)
  
  // Load session data
  useEffect(() => {
    if (!sessionId) return
    
    dispatch(loadSessionStart())
    
    const loadSession = async () => {
      try {
        const response = await axios.get(`/api/sessions/${sessionId}`)
        dispatch(loadSessionSuccess({
          ...response.data,
          sessionId,
        }))
      } catch (err) {
        dispatch(loadSessionError('Failed to load puzzle'))
      }
    }
    
    loadSession()
  }, [sessionId, dispatch])
  
  // Join session via socket
  useEffect(() => {
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
        }
      },
      
      cell_updated: (data: { 
        r: number
        c: number
        value: string
        senderId?: string
      }) => {
        if (data.senderId === socketId) return

        const value = data.value || ' '
        dispatch(updateCell({
          r: data.r,
          c: data.c,
          value
        }))
        dispatch(addChangedCells([`${data.r}-${data.c}`]))
      },
      word_claimed: (data: {
        clueKey: string
        userId: number | null
        username: string
        timestamp: string
      }) => {
        dispatch(setAttribution({
          clueKey: data.clueKey,
          userId: data.userId,
          username: data.username,
          timestamp: data.timestamp
        }))
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
  }, [isConnected, on, off, dispatch, socketId])
  
  // Periodic sync
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
      console.error('[Sync] Failed:', err)
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
      if (!sessionId || !isConnected) return
      send({
        type: 'update_cell',
        sessionId,
        r,
        c,
        value
      })
    }
  }
}
