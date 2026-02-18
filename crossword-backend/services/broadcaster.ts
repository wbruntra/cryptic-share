import { SSEService } from './sseService'

/**
 * Service to handle broadcasting to SSE clients
 */
export class Broadcaster {
  /**
   * Broadcast an event to all clients in a session (SSE)
   * @param sessionId The session ID to broadcast to
   * @param type The event type (e.g. 'puzzle_updated', 'cell_updated')
   * @param data The payload data
   * @param excludeSenderId Optional SSE client ID to exclude (e.g. sender)
   */
  static async broadcast(sessionId: string, type: string, data: any, excludeSenderId?: string) {
    // Broadcast to SSE
    try {
      // SSEService handles exclusion internally if excludeSenderId is provided
      SSEService.broadcast(sessionId, type, data, excludeSenderId)
    } catch (error) {
      console.error('[Broadcaster] SSE error:', error)
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
    try {
      // We pass senderId so SSE implementation implies it *might* exclude it,
      // but for now our SSE broadcast implementation uses it to filter.
      SSEService.broadcast(sessionId, 'cell_updated', data, senderId)
    } catch (e) {
      console.error('[Broadcaster] SSE error', e)
    }
  }

  /**
   * Broadcast answer feedback (green/red flash) to all session participants
   */
  static async broadcastAnswerFeedback(
    sessionId: string,
    cells: string[],
    isCorrect: boolean,
    senderId: string,
  ) {
    const data = { cells, isCorrect }
    try {
      SSEService.broadcast(sessionId, 'answer_feedback', data, senderId)
    } catch (e) {
      console.error('[Broadcaster] SSE error broadcasting answer feedback', e)
    }
  }
}
