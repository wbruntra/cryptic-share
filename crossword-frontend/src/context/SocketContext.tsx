import React, { createContext, useEffect, useState, useContext, useRef, useCallback } from 'react'
import type { ReactNode } from 'react'

interface SocketContextValue {
  ws: WebSocket | null
  socketId: string | null
  isConnected: boolean
  send: (data: object) => void
  on: (type: string, handler: (data: any) => void) => void
  off: (type: string, handler: (data: any) => void) => void
}

export const SocketContext = createContext<SocketContextValue>({
  ws: null,
  socketId: null,
  isConnected: false,
  send: () => {},
  on: () => {},
  off: () => {},
})

interface SocketProviderProps {
  children: ReactNode
}

export const SocketProvider: React.FC<SocketProviderProps> = ({ children }) => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const wsUrl = `${protocol}//${window.location.host}/ws`

  const [ws, setWs] = useState<WebSocket | null>(null)
  const [socketId, setSocketId] = useState<string | null>(null)
  const [isConnected, setIsConnected] = useState(false)

  // Event handlers map: type -> Set of handlers
  const handlersRef = useRef<Map<string, Set<(data: any) => void>>>(new Map())

  // Connect on mount
  useEffect(() => {
    let socket: WebSocket | null = null
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null
    let reconnectAttempts = 0
    const maxReconnectAttempts = 5

    const connect = () => {
      socket = new WebSocket(wsUrl)

      socket.onopen = () => {
        setWs(socket)
        setIsConnected(true)
        // SocketId will be set when we receive connection_established message
        reconnectAttempts = 0
      }

      socket.onclose = () => {
        setIsConnected(false)
        setSocketId(null)

        // Auto-reconnect with backoff
        if (reconnectAttempts < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 10000)
          reconnectTimeout = setTimeout(() => {
            reconnectAttempts++
            connect()
          }, delay)
        }
      }

      socket.onerror = (error) => {
        console.error('[WebSocket] Error:', error)
      }

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          const type = data.type

          // Handle connection_established message to set socketId
          if (type === 'connection_established') {
            setSocketId(data.socketId)
            return
          }

          // Call all handlers registered for this message type
          const handlers = handlersRef.current.get(type)
          if (handlers) {
            handlers.forEach((handler) => handler(data))
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
      if (socket) {
        socket.close()
      }
    }
  }, [wsUrl])

  // Send a message
  const send = useCallback(
    (data: object) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data))
      } else {
        console.warn('[WebSocket] Cannot send, not connected')
      }
    },
    [ws],
  )

  // Register a handler for a message type
  const on = useCallback((type: string, handler: (data: any) => void) => {
    if (!handlersRef.current.has(type)) {
      handlersRef.current.set(type, new Set())
    }
    handlersRef.current.get(type)!.add(handler)
  }, [])

  // Unregister a handler
  const off = useCallback((type: string, handler: (data: any) => void) => {
    const handlers = handlersRef.current.get(type)
    if (handlers) {
      handlers.delete(handler)
    }
  }, [])

  return (
    <SocketContext.Provider value={{ ws, socketId, isConnected, send, on, off }}>
      {children}
    </SocketContext.Provider>
  )
}

// Custom hook for easier usage
export const useSocket = () => useContext(SocketContext)
