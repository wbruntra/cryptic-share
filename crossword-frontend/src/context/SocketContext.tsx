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
  const [socket, setSocket] = useState<Socket | null>(null)
  const [socketId, setSocketId] = useState<string | null>(null)
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    // Create socket connection
    const newSocket = io('/', {
      // Use polling first, then upgrade to websocket to avoid proxy issues
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    })

    newSocket.on('connect', () => {
      console.log('Socket connected:', newSocket.id)
      setSocketId(newSocket.id ?? null)
      setIsConnected(true)
    })

    newSocket.on('disconnect', () => {
      console.log('Socket disconnected')
      setSocketId(null)
      setIsConnected(false)
    })

    newSocket.on('connect_error', (error) => {
      console.error('Socket connection error:', error.message)
    })

    setSocket(newSocket)

    return () => {
      newSocket.close()
    }
  }, [])

  return (
    <SocketContext.Provider value={{ socket, socketId, isConnected }}>
      {children}
    </SocketContext.Provider>
  )
}

// Custom hook for easier usage
export const useSocket = () => useContext(SocketContext)
