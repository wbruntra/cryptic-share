#!/usr/bin/env bun
import app from '../hono-app'
import { SSEService } from '../services/sseService'

const port = Number(process.env.PORT || 8921)

/**
 * Bun server using Hono framework
 */
export const bunServer = Bun.serve({
  port,
  idleTimeout: 180, // 3 minutes for SSE connections
  fetch: app.fetch,
})

console.log(`Backend server running at http://localhost:${port}`)

// Start SSE Heartbeat
SSEService.startHeartbeat()
