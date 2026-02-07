import type { Middleware } from '@reduxjs/toolkit'
import {
  sendCellUpdate,
  sendClaimWord,
  socketReceivedPuzzleUpdated,
  socketReceivedCellUpdated,
  socketReceivedWordClaimed,
  socketReceivedExplanation,
  socketReceivedAdminExplanation,
  setSocketInstance,
} from '../actions/socketActions'
import { joinSession, leaveSession } from '../slices/socketSlice'
import { syncFromServer, updateCell, setAttribution, addChangedCells } from '../slices/puzzleSlice'

let socketSend: ((data: object) => void) | null = null
let currentSocketId: string | null = null

export const setSocketSend = (send: (data: object) => void) => {
  socketSend = send
}

export const setCurrentSocketId = (socketId: string | null) => {
  currentSocketId = socketId
}

export const socketMiddleware: Middleware = () => (next) => (action) => {
  if (setSocketInstance.match(action)) {
    socketSend = action.payload.send
    return next(action)
  }

  if (sendCellUpdate.match(action)) {
    if (socketSend) {
      socketSend({
        type: 'update_cell',
        sessionId: action.payload.sessionId,
        r: action.payload.r,
        c: action.payload.c,
        value: action.payload.value,
      })
    }
    return next(action)
  }

  if (sendClaimWord.match(action)) {
    if (socketSend) {
      socketSend({
        type: 'claim_word',
        sessionId: action.payload.sessionId,
        clueKey: action.payload.clueKey,
        userId: action.payload.userId,
        username: action.payload.username,
      })
    }
    return next(action)
  }

  if (joinSession.match(action)) {
    if (socketSend) {
      socketSend({
        type: 'join_session',
        sessionId: action.payload,
      })
    }
    return next(action)
  }

  if (leaveSession.match(action)) {
    if (socketSend) {
      socketSend({
        type: 'leave_session',
      })
    }
    return next(action)
  }

  if (socketReceivedPuzzleUpdated.match(action)) {
    return next(syncFromServer(action.payload.state))
  }

  if (socketReceivedCellUpdated.match(action)) {
    if (action.payload.senderId && action.payload.senderId === currentSocketId) {
      return next(action)
    }
    next(updateCell({
      r: action.payload.r,
      c: action.payload.c,
      value: action.payload.value || ' ',
    }))
    return next(addChangedCells([`${action.payload.r}-${action.payload.c}`]))
  }

  if (socketReceivedWordClaimed.match(action)) {
    return next(setAttribution({
      clueKey: action.payload.clueKey,
      userId: action.payload.userId,
      username: action.payload.username,
      timestamp: action.payload.timestamp,
    }))
  }

  if (socketReceivedExplanation.match(action)) {
    return next(action)
  }

  if (socketReceivedAdminExplanation.match(action)) {
    return next(action)
  }

  return next(action)
}
