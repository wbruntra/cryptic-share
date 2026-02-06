import { Server as SocketIOServer, Socket } from 'socket.io'
import { SessionService } from './sessionService'
import { PushService } from './pushService'

export class SocketService {
  // Track connected sockets per session: sessionId -> Set of socket IDs
  private static connectedSockets = new Map<string, Set<string>>()
  // Track session ID per socket for cleanup: socketId -> sessionId
  private static socketToSession = new Map<string, string>()

  /**
   * Initialize Socket.IO event handlers
   */
  static initialize(io: SocketIOServer): void {
    io.on('connection', (socket) => {
      console.log('User connected:', socket.id)

      socket.on('join_session', async (sessionId: string, pushEndpoint?: string) => {
        this.handleJoinSession(socket, sessionId, pushEndpoint)
      })

      socket.on(
        'link_push_session',
        async ({ sessionId, endpoint }: { sessionId: string; endpoint: string }) => {
          this.handleLinkPushSession(socket, sessionId, endpoint)
        },
      )

      socket.on('update_puzzle', async ({ sessionId, state }) => {
        this.handleUpdatePuzzle(socket, sessionId, state)
      })

      socket.on('update_cell', async ({ sessionId, r, c, value }) => {
        this.handleUpdateCell(socket, sessionId, r, c, value)
      })

      socket.on('claim_word', async ({ sessionId, clueKey, userId, username }) => {
        this.handleClaimWord(io, sessionId, clueKey, userId, username)
      })

      socket.on('disconnect', () => {
        this.handleDisconnect(socket)
      })
    })
  }

  /**
   * Handle user joining a session
   */
  private static async handleJoinSession(
    socket: Socket,
    sessionId: string,
    pushEndpoint?: string,
  ): Promise<void> {
    socket.join(sessionId)

    // Track this socket for session
    if (!this.connectedSockets.has(sessionId)) {
      this.connectedSockets.set(sessionId, new Set())
    }
    this.connectedSockets.get(sessionId)!.add(socket.id)
    this.socketToSession.set(socket.id, sessionId)

    // Send authoritative current state to the newly joined socket
    // This is critical for mobile sleep/wake: the client may have missed updates while offline
    try {
      const state = await SessionService.getSessionState(sessionId)
      if (state) {
        socket.emit('puzzle_updated', state)
      }
    } catch (error) {
      console.error('Error sending session snapshot on join:', error)
    }

    // Clear notified flag when user reconnects and link this session to the user's global subscription
    if (pushEndpoint) {
      await PushService.linkSession(sessionId, pushEndpoint)
      await PushService.clearNotifiedFlag(sessionId, pushEndpoint)
    }

    console.log(`User ${socket.id} joined session ${sessionId}`)
  }

  /**
   * Handle late push session linking
   */
  private static async handleLinkPushSession(
    socket: Socket,
    sessionId: string,
    endpoint: string,
  ): Promise<void> {
    console.log(
      `[Push] Received link_push_session request for session ${sessionId} from ${socket.id}`,
    )
    if (sessionId && endpoint) {
      await PushService.linkSession(sessionId, endpoint)
      await PushService.clearNotifiedFlag(sessionId, endpoint)
      console.log(`[Push] Late-linked ${endpoint.slice(0, 20)}... to session ${sessionId}`)
    } else {
      console.warn(`[Push] Missing sessionId or endpoint for link_push_session:`, {
        sessionId,
        hasEndpoint: !!endpoint,
      })
    }
  }

  /**
   * Handle full puzzle state update
   */
  private static async handleUpdatePuzzle(
    socket: Socket,
    sessionId: string,
    state: unknown,
  ): Promise<void> {
    // Broadcast to others in the room
    socket.to(sessionId).emit('puzzle_updated', state)

    // Persist via Service (cached)
    try {
      await SessionService.updateSessionState(sessionId, state)
    } catch (error) {
      console.error('Error saving session state via socket:', error)
    }
  }

  /**
   * Handle individual cell update
   */
  private static async handleUpdateCell(
    socket: Socket,
    sessionId: string,
    r: number,
    c: number,
    value: string,
  ): Promise<void> {
    // Broadcast to others immediately
    socket.to(sessionId).emit('cell_updated', { r, c, value, senderId: socket.id })

    try {
      // Use Service to update cache and schedule DB save
      await SessionService.updateCell(sessionId, r, c, value)
    } catch (error) {
      console.error('Error saving session cell state via socket:', error)
    }
  }

  /**
   * Handle user claiming a word
   */
  private static async handleClaimWord(
    io: SocketIOServer,
    sessionId: string,
    clueKey: string,
    userId: number | null,
    username: string,
  ): Promise<void> {
    try {
      const claimed = await SessionService.recordWordAttribution(sessionId, clueKey, userId, username)
      if (claimed) {
        const timestamp = new Date().toISOString()
        // Broadcast to all users in the session (including sender)
        io.to(sessionId).emit('word_claimed', {
          clueKey,
          userId,
          username,
          timestamp,
        })
        console.log(`[Attribution] ${username} claimed ${clueKey} in session ${sessionId}`)
      }
    } catch (error) {
      console.error('Error claiming word:', error)
    }
  }

  /**
   * Handle socket disconnection
   */
  private static handleDisconnect(socket: Socket): void {
    const sessionId = this.socketToSession.get(socket.id)
    if (sessionId) {
      this.connectedSockets.get(sessionId)?.delete(socket.id)
      if (this.connectedSockets.get(sessionId)?.size === 0) {
        this.connectedSockets.delete(sessionId)
      }
      this.socketToSession.delete(socket.id)
    }
    console.log('User disconnected:', socket.id)
  }
}
