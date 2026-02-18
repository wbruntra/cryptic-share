import { createAction } from '@reduxjs/toolkit'

export const sendCellUpdate = createAction<{
  sessionId: string
  r: number
  c: number
  value: string
}>('socket/sendCellUpdate')

export const sendClaimWord = createAction<{
  sessionId: string
  clueKey: string
  userId: number | null
  username: string
}>('socket/sendClaimWord')

export const socketReceivedPuzzleUpdated = createAction<{
  state: string[]
}>('socket/receivedPuzzleUpdated')

export const socketReceivedCellUpdated = createAction<{
  r: number
  c: number
  value: string
  senderId?: string
}>('socket/receivedCellUpdated')

export const socketReceivedWordClaimed = createAction<{
  clueKey: string
  userId: number | null
  username: string
  timestamp: string
}>('socket/receivedWordClaimed')

export const setSocketInstance = createAction<{
  send: (data: object) => void
}>('socket/setSocketInstance')

export const socketReceivedExplanation = createAction<{
  requestId: string
  clueNumber: number
  direction: 'across' | 'down'
  success: boolean
  explanation?: Record<string, unknown>
  error?: string
}>('socket/receivedExplanation')

export const socketReceivedAnswerFeedback = createAction<{
  cells: string[]
  isCorrect: boolean
}>('socket/receivedAnswerFeedback')
