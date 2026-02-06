import React, { createContext, useEffect, useState, useContext } from 'react'
import type { ReactNode } from 'react'
import { io, Socket } from 'socket.io-client'

interface SocketContextValue {
  socket: Socket | null
  socketId: string | null
  isConnected: boolean
}

export const SocketContext = createContext<SocketContextValue>({
  socket: null,
  socketId: null,
  isConnected: false,
})

interface SocketProviderProps {
  children: ReactNode
}

export const SocketProvider: React.FC<SocketProviderProps> = ({ children }) => {
  const socketUrl = import.meta.env.DEV ? 'http://localhost:8921' : '/'
  const [socket] = useState(() =>
    io(socketUrl, {
      // Use polling first, then upgrade to websocket to avoid proxy issues
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    }),
  )
  const [socketId, setSocketId] = useState<string | null>(null)
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    const handleConnect = () => {
      setSocketId(socket.id ?? null)
      setIsConnected(true)
    }

    const handleDisconnect = () => {
      setSocketId(null)
      setIsConnected(false)
    }

    const handleConnectError = (error: Error) => {
      console.error('Socket connection error:', error.message)
    }

    socket.on('connect', handleConnect)
    socket.on('disconnect', handleDisconnect)
    socket.on('connect_error', handleConnectError)

    return () => {
      socket.off('connect', handleConnect)
      socket.off('disconnect', handleDisconnect)
      socket.off('connect_error', handleConnectError)
      socket.close()
    }
  }, [socket])

  return (
    <SocketContext.Provider value={{ socket, socketId, isConnected }}>
      {children}
    </SocketContext.Provider>
  )
}

// Custom hook for easier usage
export const useSocket = () => useContext(SocketContext)
