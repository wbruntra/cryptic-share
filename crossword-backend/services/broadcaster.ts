import { SSEService } from './sseService'

/**
 * Helper to get bunServer dynamically to avoid circular deps
 */
async function getBunServer() {
  const { bunServer } = await import('../bin/server')
  return bunServer
}

/**
 * Service to handle broadcasting to both WebSocket and SSE clients
 */
export class Broadcaster {
  /**
   * Broadcast an event to all clients in a session (WS and SSE)
   * @param sessionId The session ID to broadcast to
   * @param type The event type (e.g. 'puzzle_updated', 'cell_updated')
   * @param data The payload data
   * @param excludeSenderId Optional ID to exclude (socketId or sseClientId) mechanism depends on transport
   */
  static async broadcast(sessionId: string, type: string, data: any, excludeSenderId?: string) {
    const payload = JSON.stringify({
      type,
      ...data,
    })

    // 1. Broadcast to WebSocket (Native Bun)
    try {
      const bunServer = await getBunServer()
      // Bun.publish sends to all subscribers of the topic
      // Note: check behavior regarding excludeSenderId - Bun.publish sends to everyone subscribed.
      // If we need to exclude the sender in WS, we might need a different approach or let the client filter.
      // Current wsService usage:
      // bunServer.publish(sessionId, JSON.stringify({ type: 'puzzle_updated', state }))
      // The client usually filters if it receives its own message, or we accept the redundancy.
      // For 'cell_updated', we send 'senderId' in the payload so client can ignore.

      bunServer.publish(sessionId, payload)
    } catch (error) {
      console.error('[Broadcaster] Error publishing to WebSocket:', error)
    }

    // 2. Broadcast to SSE
    try {
      // SSEService handles exclusion internally if excludeSenderId is provided
      SSEService.broadcast(sessionId, type, data, excludeSenderId)
    } catch (error) {
      console.error('[Broadcaster] Error publishing to SSE:', error)
    }
  }

  /**
   * Broadcast payload specifically for cell updates (includes senderId for client-side filtering)
   */
  static async broadcastCellUpdate(
    sessionId: string,
    r: number,
    c: number,
    value: string,
    senderId: string,
  ) {
    const data = { r, c, value, senderId }
    // WS
    try {
      const bunServer = await getBunServer()
      bunServer.publish(sessionId, JSON.stringify({ type: 'cell_updated', ...data }))
    } catch (e) {
      console.error('[Broadcaster] WS error', e)
    }

    // SSE
    try {
      // We pass senderId so SSE implementation implies it *might* exclude it,
      // but for now our SSE broadcast implementation uses it to filter.
      SSEService.broadcast(sessionId, 'cell_updated', data, senderId)
    } catch (e) {
      console.error('[Broadcaster] SSE error', e)
    }
  }
}
