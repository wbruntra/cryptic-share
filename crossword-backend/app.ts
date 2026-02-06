import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import { setupMiddleware } from './middleware/setup'
import { setupRoutes } from './routes'
import { SocketService } from './services/socketService'

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: {
    origin: '*',
  },
})

// Configure middleware
setupMiddleware(app)

// Initialize Socket.IO
SocketService.initialize(io)

// Mount routes
setupRoutes(app)

export { app, httpServer, io }
