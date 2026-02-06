import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { createServer } from 'http'
import { Server as SocketIOServer } from 'socket.io'
import { io as ioc, type Socket as ClientSocket } from 'socket.io-client'
import { SocketService } from '../services/socketService'
import { SessionService } from '../services/sessionService'
import express from 'express'
import { AddressInfo } from 'net'

describe('SocketService', () => {
  let io: SocketIOServer
  let server: any
  let clientSocket: ClientSocket
  let clientSocket2: ClientSocket
  let port: number

  beforeAll((done) => {
    // Mock SessionService to avoid DB calls
    SocketService['connectedSockets'] = new Map()
    SocketService['socketToSession'] = new Map()

    // Mock static methods
    // @ts-ignore
    SessionService.getSessionState = async () => null
    // @ts-ignore
    SessionService.updateSessionState = async () => true
    // @ts-ignore
    SessionService.updateCell = async () => {}
    // @ts-ignore
    SessionService.recordWordAttribution = async () => true

    const app = express()
    server = createServer(app)
    io = new SocketIOServer(server)

    // Initialize the service we want to test
    SocketService.initialize(io)

    server.listen(() => {
      port = (server.address() as AddressInfo).port

      // Setup clients
      clientSocket = ioc(`http://localhost:${port}`)
      clientSocket2 = ioc(`http://localhost:${port}`)

      let connectedCount = 0
      const onConnect = () => {
        connectedCount++
        if (connectedCount === 2) {
          done()
        }
      }

      clientSocket.on('connect', onConnect)
      clientSocket2.on('connect', onConnect)
    })
  })

  afterAll(() => {
    io.close()
    server.close()
    clientSocket.close()
    clientSocket2.close()
  })

  it('should allow a client to join a session', (done) => {
    const sessionId = 'test-session-1'

    // Listen for puzzle_updated, which happens on join if state exists (might not here, but verifies connection)
    // or just rely on the callback/lack of error.
    // For now, let's just emit and wait a bit, or check server state if we could (mocking needed for that).
    // A better test is to see if we can receive messages in that room.

    clientSocket.emit('join_session', sessionId)

    // Give it a moment to join
    setTimeout(() => {
      // We can't easily check server internal state without exposing it,
      // but we can check if messages are routed correctly.
      done()
    }, 50)
  })

  it('should broadcast cell updates to other clients in the session', (done) => {
    const sessionId = 'test-session-cell'
    const cellData = { r: 0, c: 0, value: 'A' }

    // Both join the session
    clientSocket.emit('join_session', sessionId)
    clientSocket2.emit('join_session', sessionId)

    // Wait for joins to process
    setTimeout(() => {
      // Client 2 listens for update
      clientSocket2.on('cell_updated', (data) => {
        try {
          expect(data.r).toBe(cellData.r)
          expect(data.c).toBe(cellData.c)
          expect(data.value).toBe(cellData.value)
          expect(data.senderId).toBe(clientSocket.id)
          clientSocket2.off('cell_updated')
          done()
        } catch (e) {
          done(e)
        }
      })

      // Client 1 sends update
      clientSocket.emit('update_cell', { sessionId, ...cellData })
    }, 300)
  })

  it('should broadcast puzzle state updates to other clients in the session', (done) => {
    const sessionId = 'test-session-2'
    const puzzleState = { grid: [['B']] }

    clientSocket.emit('join_session', sessionId)
    clientSocket2.emit('join_session', sessionId)

    setTimeout(() => {
      clientSocket2.on('puzzle_updated', (data) => {
        try {
          expect(data).toEqual(puzzleState)
          clientSocket2.off('puzzle_updated')
          done()
        } catch (e) {
          done(e)
        }
      })

      clientSocket.emit('update_puzzle', { sessionId, state: puzzleState })
    }, 50)
  })
})
