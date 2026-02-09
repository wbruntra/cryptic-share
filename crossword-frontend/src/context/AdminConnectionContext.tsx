import React, { createContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { store } from '@/store/store'
import { connectionEstablished, connectionLost } from '@/store/slices/socketSlice'
import { socketReceivedAdminExplanation } from '@/store/actions/socketActions'

interface AdminConnectionContextValue {
  isConnected: boolean
}

export const AdminConnectionContext = createContext<AdminConnectionContextValue>({
  isConnected: false,
})

interface AdminConnectionProviderProps {
  children: ReactNode
}

export const AdminConnectionProvider: React.FC<AdminConnectionProviderProps> = ({ children }) => {
  const eventSourceRef = useRef<EventSource | null>(null)
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    const connect = () => {
      // Use a special session ID for admin global events
      const sseUrl = '/api/sessions/admin-global/events'
      console.log('[AdminConnection] Connecting to SSE:', sseUrl)

      const es = new EventSource(sseUrl)
      eventSourceRef.current = es

      es.onopen = () => {
        console.log('[AdminConnection] SSE Connected')
        setIsConnected(true)
      }

      es.onerror = (err) => {
        console.error('[AdminConnection] SSE Error:', err)
        setIsConnected(false)
        store.dispatch(connectionLost())
        es.close()
      }

      es.addEventListener('connection_established', (e: MessageEvent) => {
        const data = JSON.parse(e.data)
        console.log('[AdminConnection] Established, socketId:', data.socketId)
        store.dispatch(connectionEstablished(data.socketId))
      })

      es.addEventListener('admin_explanation_ready', (e: MessageEvent) => {
        const data = JSON.parse(e.data)
        store.dispatch(
          socketReceivedAdminExplanation({
            requestId: data.requestId,
            success: data.success,
            explanation: data.explanation,
            error: data.error,
          }),
        )
      })
    }

    connect()

    return () => {
      if (eventSourceRef.current) {
        console.log('[AdminConnection] Closing SSE')
        store.dispatch(connectionLost())
        eventSourceRef.current.close()
        eventSourceRef.current = null
        setIsConnected(false)
      }
    }
  }, [])

  return (
    <AdminConnectionContext.Provider value={{ isConnected }}>
      {children}
    </AdminConnectionContext.Provider>
  )
}
