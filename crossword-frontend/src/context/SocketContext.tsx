import React, { createContext, useEffect, useContext, useCallback, useRef } from 'react'
import type { ReactNode } from 'react'
import { store } from '@/store/store'
import {
  connectionEstablished,
  connectionLost,
  connectionError,
  reconnectAttempt,
} from '@/store/slices/socketSlice'
import {
  socketReceivedPuzzleUpdated,
  socketReceivedCellUpdated,
  socketReceivedWordClaimed,
  socketReceivedExplanation,
  socketReceivedAdminExplanation,
} from '@/store/actions/socketActions'
import {
  setSocketSend,
  setCurrentSocketId,
} from '@/store/middleware/socketMiddleware'

interface SocketContextValue {
  send: (data: object) => void
}

export const SocketContext = createContext<SocketContextValue>({
  send: () => {},
})

interface SocketProviderProps {
  children: ReactNode
}

export const SocketProvider: React.FC<SocketProviderProps> = ({ children }) => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const wsUrl = `${protocol}//${window.location.host}/ws`
  const socketRef = useRef<WebSocket | null>(null)

  const send = useCallback((data: object) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(data))
    } else {
      console.warn('[WebSocket] Cannot send, not connected')
    }
  }, [])

  useEffect(() => {
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null
    let reconnectAttempts = 0
    const maxReconnectAttempts = 5

    const connect = () => {
      const socket = new WebSocket(wsUrl)
      socketRef.current = socket

      socket.onopen = () => {
        reconnectAttempts = 0
        setSocketSend(send)
      }

      socket.onclose = () => {
        store.dispatch(connectionLost())
        setCurrentSocketId(null)

        if (reconnectAttempts < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 10000)
          reconnectTimeout = setTimeout(() => {
            reconnectAttempts++
            store.dispatch(reconnectAttempt(reconnectAttempts))
            connect()
          }, delay)
        } else {
          store.dispatch(connectionError('Unable to connect to server'))
        }
      }

      socket.onerror = () => {
        store.dispatch(connectionError('Connection error'))
      }

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          const type = data.type

          if (type === 'connection_established') {
            store.dispatch(connectionEstablished(data.socketId))
            setCurrentSocketId(data.socketId)
            return
          }

          if (type === 'puzzle_updated') {
            const state = Array.isArray(data) ? data : data?.state
            if (Array.isArray(state)) {
              store.dispatch(socketReceivedPuzzleUpdated({ state }))
            }
            return
          }

          if (type === 'cell_updated') {
            store.dispatch(socketReceivedCellUpdated({
              r: data.r,
              c: data.c,
              value: data.value,
              senderId: data.senderId,
            }))
            return
          }

          if (type === 'word_claimed') {
            store.dispatch(socketReceivedWordClaimed({
              clueKey: data.clueKey,
              userId: data.userId,
              username: data.username,
              timestamp: data.timestamp,
            }))
            return
          }

          if (type === 'explanation_ready') {
            store.dispatch(socketReceivedExplanation({
              requestId: data.requestId,
              clueNumber: data.clueNumber,
              direction: data.direction,
              success: data.success,
              explanation: data.explanation,
              error: data.error,
            }))
            return
          }

          if (type === 'admin_explanation_ready') {
            store.dispatch(socketReceivedAdminExplanation({
              requestId: data.requestId,
              success: data.success,
              explanation: data.explanation,
              error: data.error,
            }))
            return
          }
        } catch (error) {
          console.error('[WebSocket] Failed to parse message:', error)
        }
      }
    }

    connect()

    return () => {
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout)
      }
      if (socketRef.current) {
        socketRef.current.close()
      }
    }
  }, [wsUrl, send])

  return (
    <SocketContext.Provider value={{ send }}>
      {children}
    </SocketContext.Provider>
  )
}

export const useSocket = () => useContext(SocketContext)
