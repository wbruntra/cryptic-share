import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cookieSession from 'cookie-session'
import morgan from 'morgan'
import puzzlesRouter from './routes/puzzles'
import sessionsRouter from './routes/sessions'
import cluesRouter from './routes/clues'
import authRouter from './routes/auth'
import adminSessionsRouter from './routes/admin-sessions'
import { SessionService } from './services/sessionService'
import { PushService } from './services/pushService'

// Track connected sockets per session: sessionId -> Set of socket IDs
const connectedSockets = new Map<string, Set<string>>()
// Track session ID per socket for cleanup: socketId -> sessionId
const socketToSession = new Map<string, string>()

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: {
    origin: '*',
  },
})

const cookieSecret = process.env.COOKIE_SECRET || 'default_secret'

// Middleware
app.use(morgan('dev'))
app.use(express.json({ limit: '50mb' }))
app.use(
  cookieSession({
    name: 'session',
    keys: [cookieSecret],
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  }),
)

// Socket.IO Logic
io.on('connection', (socket) => {
  console.log('User connected:', socket.id)

  socket.on('join_session', async (sessionId: string, pushEndpoint?: string) => {
    socket.join(sessionId)

    // Track this socket for session
    if (!connectedSockets.has(sessionId)) {
      connectedSockets.set(sessionId, new Set())
    }
    connectedSockets.get(sessionId)!.add(socket.id)
    socketToSession.set(socket.id, sessionId)

    // Clear notified flag when user reconnects (so they can get notifications again later)
    // AND link this session to the user's global subscription so they get updates for THIS puzzle
    if (pushEndpoint) {
      // Create/ensure link between session and endpoint
      await PushService.linkSession(sessionId, pushEndpoint)
      // Clear flag just in case
      await PushService.clearNotifiedFlag(sessionId, pushEndpoint)
    }

    console.log(`User ${socket.id} joined session ${sessionId}`)
  })

  // Allow linking a session after the user has subscribed (useful when they subscribe AFTER join_session)
  socket.on(
    'link_push_session',
    async ({ sessionId, endpoint }: { sessionId: string; endpoint: string }) => {
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
    },
  )

  socket.on('update_puzzle', async ({ sessionId, state }) => {
    // Broadcast to others in the room
    socket.to(sessionId).emit('puzzle_updated', state)

    // Persist via Service (cached)
    try {
      await SessionService.updateSessionState(sessionId, state)
    } catch (error) {
      console.error('Error saving session state via socket:', error)
    }
  })

  socket.on('update_cell', async ({ sessionId, r, c, value }) => {
    // Broadcast to others immediately
    socket.to(sessionId).emit('cell_updated', { r, c, value })

    try {
      // Use Service to update cache and schedule DB save
      await SessionService.updateCell(sessionId, r, c, value)

      // Get puzzle title for notification
      const session = await SessionService.getSessionWithPuzzle(sessionId)
      if (session) {
        // Get all socket IDs currently connected to this session
        const connectedSessionSockets = connectedSockets.get(sessionId) || new Set()

        console.log(`[Push] Checking push for session ${sessionId}`)
        await PushService.notifySessionParticipants(sessionId, session.title)
      }
    } catch (error) {
      console.error('Error saving session cell state via socket:', error)
    }
  })

  socket.on('disconnect', () => {
    const sessionId = socketToSession.get(socket.id)
    if (sessionId) {
      connectedSockets.get(sessionId)?.delete(socket.id)
      if (connectedSockets.get(sessionId)?.size === 0) {
        connectedSockets.delete(sessionId)
      }
      socketToSession.delete(socket.id)
    }
    console.log('User disconnected:', socket.id)
  })
})

// Login Route
app.post('/api/login', (req, res) => {
  const { password } = req.body
  if (password === process.env.ADMIN_PASSWORD) {
    req.session = { isAdmin: true }
    res.json({ success: true })
  } else {
    res.status(401).json({ error: 'Invalid password' })
  }
})

// Check Auth Route (for frontend state)
app.get('/api/check-auth', (req, res) => {
  if (req.session?.isAdmin) {
    res.json({ authenticated: true })
  } else {
    res.status(401).json({ authenticated: false })
  }
})

// Push Notification Routes
app.get('/api/push/vapid-key', (_req, res) => {
  const publicKey = PushService.getVapidPublicKey()
  if (publicKey) {
    res.json({ publicKey })
  } else {
    res.status(503).json({ error: 'Push notifications not configured' })
  }
})

app.post('/api/push/subscribe', async (req, res) => {
  const { subscription } = req.body
  // SessionId is no longer needed here for the global subscription
  // The link happens via socket join or explicit user action if we wanted

  if (!subscription?.endpoint || !subscription?.keys) {
    return res.status(400).json({ error: 'Missing subscription' })
  }

  try {
    await PushService.saveSubscription(subscription)
    res.json({ success: true })
  } catch (error) {
    console.error('Push subscribe error:', error)
    res.status(500).json({ error: 'Failed to save subscription' })
  }
})

app.post('/api/push/unsubscribe', async (req, res) => {
  const { endpoint } = req.body
  if (!endpoint) {
    return res.status(400).json({ error: 'Missing endpoint' })
  }

  try {
    await PushService.removeSubscription(endpoint)
    res.json({ success: true })
  } catch (error) {
    console.error('Push unsubscribe error:', error)
    res.status(500).json({ error: 'Failed to remove subscription' })
  }
})

// Mount routes
app.use('/api/auth', authRouter)
app.use('/api/puzzles', puzzlesRouter)
app.use('/api/sessions', sessionsRouter)
app.use('/api/clues', cluesRouter)
app.use('/api/admin/sessions', adminSessionsRouter)

export { app, httpServer, io }
