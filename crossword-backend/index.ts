import express from 'express'
import cookieSession from 'cookie-session'
import puzzlesRouter from './routes/puzzles'
import sessionsRouter from './routes/sessions'
import cluesRouter from './routes/clues'
import { ADMIN_PASSWORD, COOKIE_SECRET } from './config'

const app = express()
const port = 3000

// Middleware
app.use(express.json({ limit: '50mb' }))
app.use(
  cookieSession({
    name: 'session',
    keys: [COOKIE_SECRET],
    maxAge: 24 * 60 * 60 * 1000, // 1 day
  }),
)

// Login Route
app.post('/api/login', (req, res) => {
  const { password } = req.body
  if (password === ADMIN_PASSWORD) {
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
app.use('/api/puzzles', puzzlesRouter)
app.use('/api/sessions', sessionsRouter)
app.use('/api/clues', cluesRouter)

app.listen(port, () => {
  console.log(`Backend server running at http://localhost:${port}`)
})
