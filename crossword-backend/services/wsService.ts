import { ServerWebSocket, Server } from 'bun'
import { SessionService } from './sessionService'
import { PushService } from './pushService'

// WebSocket data attached at upgrade time
export interface WebSocketData {
  sessionId: string | null
  socketId: string
}

// Message types from client
interface JoinSessionMessage {
  type: 'join_session'
  sessionId: string
  pushEndpoint?: string
}

interface LinkPushSessionMessage {
  type: 'link_push_session'
  sessionId: string
  endpoint: string
}

interface UpdatePuzzleMessage {
  type: 'update_puzzle'
  sessionId: string
  state: unknown
}

interface UpdateCellMessage {
  type: 'update_cell'
  sessionId: string
  r: number
  c: number
  value: string
}

interface ClaimWordMessage {
  type: 'claim_word'
  sessionId: string
  clueKey: string
  userId: number | null
  username: string
}

type ClientMessage =
  | JoinSessionMessage
  | LinkPushSessionMessage
  | UpdatePuzzleMessage
  | UpdateCellMessage
  | ClaimWordMessage

/**
 * Helper to get bunServer dynamically to avoid circular deps
 */
async function getBunServer() {
  const { bunServer } = await import('../bin/server')
  return bunServer
}

/**
 * Handle incoming WebSocket message
 */
export async function handleWebSocketMessage(
  ws: ServerWebSocket<WebSocketData>,
  message: string | Buffer,
) {
  try {
    const data: ClientMessage = JSON.parse(message.toString())

    switch (data.type) {
      case 'join_session':
        await handleJoinSession(ws, data.sessionId, data.pushEndpoint)
        break
      case 'link_push_session':
        await handleLinkPushSession(ws, data.sessionId, data.endpoint)
        break
      case 'update_puzzle':
        await handleUpdatePuzzle(ws, data.sessionId, data.state)
        break
      case 'update_cell':
        await handleUpdateCell(ws, data.sessionId, data.r, data.c, data.value)
        break
      case 'claim_word':
        await handleClaimWord(data.sessionId, data.clueKey, data.userId, data.username)
        break
      default:
        console.warn('Unknown message type:', (data as any).type)
    }
  } catch (error) {
    console.error('Error handling WebSocket message:', error)
  }
}

/**
 * Handle WebSocket open
 */
export function handleWebSocketOpen(ws: ServerWebSocket<WebSocketData>) {
  console.log('User connected:', ws.data.socketId)
  
  // Send the socketId to the client so they can identify their own messages
  ws.send(
    JSON.stringify({
      type: 'connection_established',
      socketId: ws.data.socketId,
    }),
  )
}

/**
 * Handle WebSocket close
 */
export function handleWebSocketClose(ws: ServerWebSocket<WebSocketData>) {
  console.log('User disconnected:', ws.data.socketId)
}

/**
 * Handle user joining a session
 */
async function handleJoinSession(
  ws: ServerWebSocket<WebSocketData>,
  sessionId: string,
  pushEndpoint?: string,
): Promise<void> {
  // Subscribe to the session topic (room)
  ws.subscribe(sessionId)
  ws.data.sessionId = sessionId

  // Send current state to the newly joined socket
  try {
    const state = await SessionService.getSessionState(sessionId)
    if (state) {
      ws.send(JSON.stringify({ type: 'puzzle_updated', state }))
    }
  } catch (error) {
    console.error('Error sending session snapshot on join:', error)
  }

  // Handle push notifications
  if (pushEndpoint) {
    await PushService.linkSession(sessionId, pushEndpoint)
    await PushService.clearNotifiedFlag(sessionId, pushEndpoint)
  }

  console.log(`User ${ws.data.socketId} joined session ${sessionId}`)
}

/**
 * Handle late push session linking
 */
async function handleLinkPushSession(
  ws: ServerWebSocket<WebSocketData>,
  sessionId: string,
  endpoint: string,
): Promise<void> {
  console.log(
    `[Push] Received link_push_session request for session ${sessionId} from ${ws.data.socketId}`,
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
async function handleUpdatePuzzle(
  ws: ServerWebSocket<WebSocketData>,
  sessionId: string,
  state: unknown,
): Promise<void> {
  // Broadcast to others in the room (excluding sender)
  try {
    const bunServer = await getBunServer()
    bunServer.publish(sessionId, JSON.stringify({ type: 'puzzle_updated', state }))
  } catch (error) {
    console.error('Error publishing puzzle update:', error)
  }

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
async function handleUpdateCell(
  ws: ServerWebSocket<WebSocketData>,
  sessionId: string,
  r: number,
  c: number,
  value: string,
): Promise<void> {
  // Broadcast to others immediately (excluding sender via senderId check on client)
  try {
    const bunServer = await getBunServer()
    bunServer.publish(
      sessionId,
      JSON.stringify({
        type: 'cell_updated',
        r,
        c,
        value,
        senderId: ws.data.socketId,
      }),
    )
  } catch (error) {
    console.error('Error publishing cell update:', error)
  }

  try {
    await SessionService.updateCell(sessionId, r, c, value)
  } catch (error) {
    console.error('Error saving session cell state via socket:', error)
  }
}

/**
 * Handle user claiming a word
 */
async function handleClaimWord(
  sessionId: string,
  clueKey: string,
  userId: number | null,
  username: string,
): Promise<void> {
  try {
    const claimed = await SessionService.recordWordAttribution(
      sessionId,
      clueKey,
      userId,
      username,
    )
    if (claimed) {
      try {
        const bunServer = await getBunServer()
        const timestamp = new Date().toISOString()
        bunServer.publish(
          sessionId,
          JSON.stringify({
            type: 'word_claimed',
            clueKey,
            userId,
            username,
            timestamp,
          }),
        )
        console.log(`[Attribution] ${username} claimed ${clueKey} in session ${sessionId}`)
      } catch (error) {
        console.error('Error publishing word claim:', error)
      }
    }
  } catch (error) {
    console.error('Error claiming word:', error)
  }
}
