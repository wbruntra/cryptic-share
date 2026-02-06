#!/usr/bin/env bun
import { Router } from '../http/router'
import { httpLogger } from '../http/logger'
import { getAuthUser } from '../middleware/auth'
import { registerRoutes } from '../routes'
import {
  handleWebSocketMessage,
  handleWebSocketOpen,
  handleWebSocketClose,
  type WebSocketData,
} from '../services/wsService'

const port = Number(process.env.PORT || 8921)

// Generate unique socket IDs
let socketCounter = 0
function generateSocketId(): string {
  return `ws-${Date.now()}-${++socketCounter}`
}

// Create the HTTP router
const router = new Router()

// Register all API routes
registerRoutes(router)

/**
 * Parse JSON body from request
 */
async function parseRequestBody(req: Request): Promise<any> {
  const contentType = req.headers.get('content-type')
  if (contentType?.includes('application/json')) {
    try {
      return await req.json()
    } catch {
      return null
    }
  }
  return null
}

/**
 * Bun server with native WebSocket support
 */
export const bunServer = Bun.serve<WebSocketData>({
  port,

  async fetch(req, server) {
    const url = new URL(req.url)
    const method = req.method
    const pathname = url.pathname

    httpLogger.onRequest(method, pathname)

    try {
      // Handle WebSocket upgrade on /ws path
      if (pathname === '/ws') {
        const success = server.upgrade(req, {
          data: {
            sessionId: null,
            socketId: generateSocketId(),
          },
        })
        if (success) {
          httpLogger.onResponse(method, pathname, 101) // 101 Switching Protocols
          return undefined // Upgrade successful
        }
        httpLogger.onResponse(method, pathname, 500)
        return new Response('WebSocket upgrade failed', { status: 500 })
      }

      // Parse body for POST/PUT/PATCH requests
      let body: any = null
      if (['POST', 'PUT', 'PATCH'].includes(method)) {
        body = await parseRequestBody(req)
      }

      // Extract auth user from JWT if present
      const user = getAuthUser(req)

      // Match route and execute handler
      const match = router.match(method, pathname)
      if (!match) {
        httpLogger.onResponse(method, pathname, 404)
        return new Response(JSON.stringify({ error: 'Not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      // Create context object for handler
      const ctx = {
        req,
        params: match.params,
        query: url.searchParams,
        body,
        user,
      }

      // Execute handler
      const response = await match.handler(ctx)

      httpLogger.onResponse(method, pathname, response.status)
      return response
    } catch (error: any) {
      httpLogger.onError(method, pathname, error)

      if (error.statusCode) {
        // HttpError thrown by handler
        return new Response(JSON.stringify(error.data || { error: error.message }), {
          status: error.statusCode,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      // Unhandled error - log detailed information
      console.error('\n=== UNHANDLED ERROR DETAILS ===')
      console.error('URL:', pathname)
      console.error('Method:', method)
      console.error('Error Name:', error.name)
      console.error('Error Message:', error.message)
      if (error.stack) {
        console.error('Stack Trace:')
        console.error(error.stack)
      }
      if (body) {
        console.error('Request Body:', JSON.stringify(body, null, 2))
      }
      console.error('=================================\n')

      return new Response(
        JSON.stringify({ error: 'Internal server error', details: error.message }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        },
      )
    }
  },

  websocket: {
    open(ws) {
      handleWebSocketOpen(ws)
    },
    message(ws, message) {
      handleWebSocketMessage(ws, message)
    },
    close(ws) {
      handleWebSocketClose(ws)
    },
  },
})

console.log(`Backend server running at http://localhost:${port}`)
console.log(`WebSocket available at ws://localhost:${port}/ws`)

