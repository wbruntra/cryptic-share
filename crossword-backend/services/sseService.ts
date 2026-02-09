// Interface compatible with both Express Response and Bun custom writer
export interface SSEWriter {
  write(data: string): void
  on?: (event: string, callback: () => void) => void
}

interface SSEClient {
  id: string
  res: SSEWriter
  sessionId: string
}

/**
 * Service to manage Server-Sent Events (SSE)
 */
export class SSEService {
  // Map of sessionId -> Set of clients
  private static sessions = new Map<string, Set<SSEClient>>()
  // Map of socketId (generated) -> client
  private static clients = new Map<string, SSEClient>()

  /**
   * Add a new client to a session
   */
  static addClient(sessionId: string, res: SSEWriter): string {
    const clientId = `sse-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    const client: SSEClient = {
      id: clientId,
      res,
      sessionId,
    }

    // Initialize session set if needed
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, new Set())
    }
    this.sessions.get(sessionId)!.add(client)
    this.clients.set(clientId, client)

    console.log(`[SSE] Client ${clientId} joined session ${sessionId}`)

    // Handle client disconnect if the writer supports it (Express)
    // For Bun streams, the cleanup is often external, but we support the hook.
    if (res.on) {
      res.on('close', () => {
        this.removeClient(clientId)
      })
    }

    return clientId
  }

  /**
   * Remove a client
   */
  static removeClient(clientId: string): void {
    const client = this.clients.get(clientId)
    if (!client) return

    // Remove from session
    const sessionClients = this.sessions.get(client.sessionId)
    if (sessionClients) {
      sessionClients.delete(client)
      if (sessionClients.size === 0) {
        this.sessions.delete(client.sessionId)
      }
    }

    // Remove from global map
    this.clients.delete(clientId)
    console.log(`[SSE] Client ${clientId} disconnected from session ${client.sessionId}`)
  }

  /**
   * Broadcast an event to all clients in a session
   * @param excludeClientId Optional client ID to exclude (e.g. sender)
   */
  static broadcast(
    sessionId: string,
    eventType: string,
    data: any,
    excludeClientId?: string,
  ): void {
    const clients = this.sessions.get(sessionId)
    if (!clients) return

    const message = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`
    const deadClients: SSEClient[] = []

    clients.forEach((client) => {
      if (client.id !== excludeClientId) {
        try {
          client.res.write(message)
        } catch (err) {
          console.log(`[SSE] Client ${client.id} write failed, marking for removal`)
          deadClients.push(client)
        }
      }
    })

    // Clean up dead clients
    deadClients.forEach((client) => this.removeClient(client.id))
  }

  /**
   * Send a specific event to a single client
   */
  static sendToClient(clientId: string, eventType: string, data: any): void {
    const client = this.clients.get(clientId)
    if (client) {
      try {
        client.res.write(`event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`)
      } catch (err) {
        console.log(`[SSE] Client ${clientId} write failed, removing`)
        this.removeClient(clientId)
      }
    }
  }

  /**
   * Send event to ALL clients in session including sender
   */
  static broadcastToSession(sessionId: string, eventType: string, data: any): void {
    this.broadcast(sessionId, eventType, data)
  }

  /**
   * Start keep-alive heartbeats
   * Should be called once at startup
   */
  static startHeartbeat(intervalMs = 15000): void {
    setInterval(() => {
      const now = new Date().toISOString()
      const deadClients: string[] = []

      this.clients.forEach((client) => {
        try {
          client.res.write(`: keepalive ${now}\n\n`)
        } catch (err) {
          deadClients.push(client.id)
        }
      })

      // Clean up dead clients discovered during heartbeat
      deadClients.forEach((id) => this.removeClient(id))
    }, intervalMs)
  }
}
