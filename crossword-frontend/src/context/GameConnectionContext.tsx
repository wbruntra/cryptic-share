import React, { createContext, useEffect, useContext, useCallback, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { store } from '@/store/store'
import {
  socketReceivedPuzzleUpdated,
  socketReceivedCellUpdated,
  socketReceivedWordClaimed,
  socketReceivedExplanation,
  socketReceivedAnswerFeedback,
} from '@/store/actions/socketActions'
import { connectionEstablished, connectionLost } from '@/store/slices/socketSlice'
import { clearFlashCells } from '@/store/slices/puzzleSlice'
import axios from 'axios'

interface GameConnectionContextValue {
  sendCellUpdate: (sessionId: string, r: number, c: number, value: string) => Promise<void>
  checkAnswers: (sessionId: string) => Promise<any>
  claimWord: (
    sessionId: string,
    clueKey: string,
    userId: number | null,
    username: string,
  ) => Promise<void>
  requestExplanation: (
    sessionId: string,
    clueNumber: number,
    direction: 'across' | 'down',
  ) => Promise<any>
  sendAnswerFeedback: (
    sessionId: string,
    cells: string[],
    isCorrect: boolean,
  ) => Promise<void>
  isConnected: boolean
}

export const GameConnectionContext = createContext<GameConnectionContextValue>({
  sendCellUpdate: async () => {},
  checkAnswers: async () => {},
  claimWord: async () => {},
  requestExplanation: async () => {},
  sendAnswerFeedback: async () => {},
  isConnected: false,
})

interface GameConnectionProviderProps {
  children: ReactNode
  sessionId: string | null
}

export const GameConnectionProvider: React.FC<GameConnectionProviderProps> = ({
  children,
  sessionId,
}) => {
  const eventSourceRef = useRef<EventSource | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [socketId, setSocketId] = useState<string | null>(null)
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const FLASH_DURATION_MS = 500

  // Send cell update via REST
  const sendCellUpdate = useCallback(
    async (sid: string, r: number, c: number, value: string) => {
      try {
        await axios.post(`/api/sessions/${sid}/cell${socketId ? `?socketId=${socketId}` : ''}`, {
          r,
          c,
          value,
        })
      } catch (error) {
        console.error('[GameConnection] Failed to send cell update:', error)
      }
    },
    [socketId],
  )

  // Check answers via REST
  const checkAnswers = useCallback(async (sid: string) => {
    try {
      const response = await axios.post(`/api/sessions/${sid}/check`)
      return response.data
    } catch (error) {
      console.error('[GameConnection] Failed to check answers:', error)
      throw error
    }
  }, [])

  // Claim word via REST
  const claimWord = useCallback(
    async (sid: string, clueKey: string, userId: number | null, username: string) => {
      try {
        await axios.post(`/api/sessions/${sid}/claim`, { clueKey, userId, username })
      } catch (error) {
        console.error('[GameConnection] Failed to claim word:', error)
      }
    },
    [],
  )

  // Request explanation via REST
  const requestExplanation = useCallback(
    async (sid: string, clueNumber: number, direction: 'across' | 'down') => {
      try {
        const response = await axios.post(`/api/sessions/${sid}/explain`, {
          clueNumber,
          direction,
        })
        return response.data
      } catch (error) {
        console.error('[GameConnection] Failed to request explanation:', error)
        throw error
      }
    },
    [],
  )

  // Send answer feedback via REST
  const sendAnswerFeedback = useCallback(
    async (sid: string, cells: string[], isCorrect: boolean) => {
      try {
        await axios.post(`/api/sessions/${sid}/feedback${socketId ? `?socketId=${socketId}` : ''}`, {
          cells,
          isCorrect,
        })
      } catch (error) {
        console.error('[GameConnection] Failed to send answer feedback:', error)
      }
    },
    [socketId],
  )

  // Connect to SSE
  useEffect(() => {
    if (!sessionId) {
      setIsConnected(false)
      return
    }

    const connect = () => {
      // Close existing if any
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
      }

      const sseUrl = `/api/sessions/${sessionId}/events`
      console.log('[GameConnection] Connecting to SSE:', sseUrl)

      const es = new EventSource(sseUrl)
      eventSourceRef.current = es

      es.onopen = () => {
        console.log('[GameConnection] SSE Connected')
        setIsConnected(true)
      }

      es.onerror = (err) => {
        console.error('[GameConnection] SSE Error:', err)
        setIsConnected(false)
        setSocketId(null)
        store.dispatch(connectionLost())
        // Native EventSource auto-reconnects for network issues
      }

      es.addEventListener('connection_established', (e: MessageEvent) => {
        const data = JSON.parse(e.data)
        console.log('[GameConnection] Established, socketId:', data.socketId)
        setSocketId(data.socketId)
        store.dispatch(connectionEstablished(data.socketId))
      })

      es.addEventListener('puzzle_updated', (e: MessageEvent) => {
        const data = JSON.parse(e.data)
        const state = Array.isArray(data) ? data : data?.state
        if (Array.isArray(state)) {
          store.dispatch(socketReceivedPuzzleUpdated({ state }))
        }
      })

      es.addEventListener('cell_updated', (e: MessageEvent) => {
        const data = JSON.parse(e.data)
        store.dispatch(
          socketReceivedCellUpdated({
            r: data.r,
            c: data.c,
            value: data.value,
            senderId: data.senderId,
          }),
        )
      })

      es.addEventListener('word_claimed', (e: MessageEvent) => {
        const data = JSON.parse(e.data)
        store.dispatch(
          socketReceivedWordClaimed({
            clueKey: data.clueKey,
            userId: data.userId,
            username: data.username,
            timestamp: data.timestamp,
          }),
        )
      })

      es.addEventListener('explanation_ready', (e: MessageEvent) => {
        const data = JSON.parse(e.data)
        store.dispatch(
          socketReceivedExplanation({
            requestId: data.requestId,
            clueNumber: data.clueNumber,
            direction: data.direction,
            success: data.success,
            explanation: data.explanation,
            error: data.error,
          }),
        )
      })

      es.addEventListener('answer_feedback', (e: MessageEvent) => {
        const data = JSON.parse(e.data)
        store.dispatch(
          socketReceivedAnswerFeedback({
            cells: data.cells,
            isCorrect: data.isCorrect,
          }),
        )
        if (flashTimeoutRef.current) {
          clearTimeout(flashTimeoutRef.current)
        }
        flashTimeoutRef.current = setTimeout(() => {
          store.dispatch(clearFlashCells())
        }, FLASH_DURATION_MS)
      })
    }

    connect()

    return () => {
      if (eventSourceRef.current) {
        console.log('[GameConnection] Closing SSE')
        store.dispatch(connectionLost())
        eventSourceRef.current.close()
        eventSourceRef.current = null
        setIsConnected(false)
        setSocketId(null)
      }
    }
  }, [sessionId])

  return (
    <GameConnectionContext.Provider
      value={{
        sendCellUpdate,
        checkAnswers,
        claimWord,
        requestExplanation,
        sendAnswerFeedback,
        isConnected,
      }}
    >
      {children}
    </GameConnectionContext.Provider>
  )
}

export const useGameConnection = () => useContext(GameConnectionContext)
