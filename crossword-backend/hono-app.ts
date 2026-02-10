import { Hono } from 'hono'
import jwt from 'jsonwebtoken'
import { JWT_SECRET } from './config'
import type { AuthUser } from './hono-middleware/auth'

// Import route modules
import { auth } from './hono-routes/auth'
import { puzzles } from './hono-routes/puzzles'
import { sessions } from './hono-routes/sessions'
import { clues } from './hono-routes/clues'
import { push } from './hono-routes/push'
import { adminSessions } from './hono-routes/admin-sessions'
import { adminExplanations } from './hono-routes/admin-explanations'

// Extend Hono context with our user type
type Variables = {
  user: AuthUser | null
}

// Create app with typed variables
export const app = new Hono<{ Variables: Variables }>()

// Logging middleware - single line per request (Morgan dev-style) with ANSI colors
app.use('*', async (c, next) => {
  const start = Date.now()
  const method = c.req.method
  const urlObj = new URL(c.req.url)
  const url = urlObj.pathname + (urlObj.search || '')

  await next()

  const status = c.res.status || 0
  const time = Date.now() - start
  const user = c.get('user') as any

  // ANSI color helpers
  const RESET = '\u001b[0m'
  const colorStatus = (s: number) => (s >= 500 ? '\u001b[31m' : s >= 400 ? '\u001b[33m' : s >= 300 ? '\u001b[36m' : '\u001b[32m')
  const colorMethod = (m: string) => (m === 'GET' ? '\u001b[34m' : m === 'POST' ? '\u001b[35m' : m === 'PUT' ? '\u001b[33m' : '\u001b[36m')

  const methodStr = `${colorMethod(method)}${method}${RESET}`
  const statusStr = `${colorStatus(status)}${status}${RESET}`
  const userStr = user && user.id ? ` user=${user.id}` : ''

  console.log(`${methodStr} ${url} ${statusStr} ${time}ms${userStr}`)
})

// Auth middleware - extract user from JWT if present
app.use('/api/*', async (c, next) => {
  const authHeader = c.req.header('authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as AuthUser
      c.set('user', decoded)
    } catch {
      c.set('user', null)
    }
  } else {
    c.set('user', null)
  }

  await next()
})

// Mount route modules
app.route('/api/auth', auth)
app.route('/api/puzzles', puzzles)
app.route('/api/sessions', sessions)
app.route('/api/clues', clues)
app.route('/api/push', push)
app.route('/api/admin/sessions', adminSessions)
app.route('/api/admin/explanations', adminExplanations)

// Also mount reports under admin (proxies to admin-explanations)
app.get('/api/admin/reports', async (c) => {
  const url = new URL(c.req.url)
  url.pathname = '/api/admin/explanations/reports'
  const newReq = new Request(url.toString(), c.req.raw)
  return app.fetch(newReq, c.env)
})

// Default export for Bun.serve compatibility
export default app
