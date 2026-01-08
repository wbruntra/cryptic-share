import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cookieSession from 'cookie-session'
import morgan from 'morgan'
import puzzlesRouter from './routes/puzzles'
import sessionsRouter from './routes/sessions'
import cluesRouter from './routes/clues'
import authRouter from './routes/auth'
import db from './db-knex'

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: {
    origin: '*',
  },
})

const port = process.env.PORT || 8921

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

  socket.on('join_session', (sessionId) => {
    socket.join(sessionId)
    console.log(`User ${socket.id} joined session ${sessionId}`)
  })

  socket.on('update_puzzle', async ({ sessionId, state }) => {
    // Broadcast to others in the room
    socket.to(sessionId).emit('puzzle_updated', state)

    // Persist to DB
    try {
      await db('puzzle_sessions')
        .where({ session_id: sessionId })
        .update({ state: JSON.stringify(state) })
    } catch (error) {
      console.error('Error saving session state via socket:', error)
    }
  })

  socket.on('update_cell', async ({ sessionId, r, c, value }) => {
    // Broadcast to others immediately
    socket.to(sessionId).emit('cell_updated', { r, c, value })

    try {
      // 1. Get current state from DB to ensure we don't overwrite other changes
      const session = await db('puzzle_sessions')
        .where({ session_id: sessionId })
        .select('state')
        .first()

      if (session) {
        let currentState = JSON.parse(session.state)

        // Validate state structure
        if (!Array.isArray(currentState)) {
          console.error(`Invalid state for session ${sessionId}`)
          return
        }

        // Ensure row exists
        if (!currentState[r]) {
          // If state is empty or partial, we need to initialize it.
          // See needsInit block below.
        }

        // We'll require a join if it looks empty or invalid.
        // Let's try to just update if it exists, otherwise fall back to a heavier load.

        let needsInit = false
        if (Array.isArray(currentState) && currentState.length === 0) {
          needsInit = true
        } else if (!currentState[r]) {
          // Maybe it's partial?
          // Safest is to re-init if we can't write.
          needsInit = true
        }

        if (needsInit) {
          const puzzle = await db('puzzle_sessions')
            .join('puzzles', 'puzzle_sessions.puzzle_id', 'puzzles.id')
            .where('puzzle_sessions.session_id', sessionId)
            .select('puzzles.grid')
            .first()

          if (puzzle && puzzle.grid) {
            // Initialize blank state based on grid
            const rows = puzzle.grid.split('\n').map((row: string) => row.trim().split(' '))
            const height = rows.length
            const width = rows[0].length
            currentState = Array(height)
              .fill(null)
              .map(() => Array(width).fill(''))
          }
        }

        // helper to safely write
        if (currentState[r] && Array.isArray(currentState[r])) {
          currentState[r][c] = value

          await db('puzzle_sessions')
            .where({ session_id: sessionId })
            .update({ state: JSON.stringify(currentState) })
        }
      }
    } catch (error) {
      console.error('Error saving session cell state via socket:', error)
    }
  })

  socket.on('disconnect', () => {
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

// Mount routes
app.use('/api/auth', authRouter)
app.use('/api/puzzles', puzzlesRouter)
app.use('/api/sessions', sessionsRouter)
app.use('/api/clues', cluesRouter)

httpServer.listen(port, () => {
  console.log(`Backend server running at http://localhost:${port}`)
})
