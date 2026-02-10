import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { requireAuth, type AuthUser } from '../hono-middleware/auth'
import { AuthService } from '../services/authService'

type Variables = { user: AuthUser | null }

const auth = new Hono<{ Variables: Variables }>()

// POST /api/auth/login
auth.post('/login', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const { username, password } = body

  if (!username || !password) {
    throw new HTTPException(400, { message: 'Username and password are required' })
  }

  try {
    const result = await AuthService.login(username, password)
    return c.json(result)
  } catch (error: any) {
    if (error.message === 'Invalid credentials') {
      throw new HTTPException(401, { message: error.message })
    }
    console.error('Login error:', error)
    throw new HTTPException(500, { message: 'Login failed' })
  }
})

// POST /api/auth/register
auth.post('/register', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const { username, password } = body

  if (!username || !password) {
    throw new HTTPException(400, { message: 'Username and password are required' })
  }

  try {
    const result = await AuthService.register(username, password)
    return c.json(result)
  } catch (error: any) {
    if (error.message === 'Username already exists') {
      throw new HTTPException(400, { message: error.message })
    }
    console.error('Registration error:', error)
    throw new HTTPException(500, { message: 'Registration failed' })
  }
})

// GET /api/auth/me
auth.get('/me', (c) => {
  const user = c.get('user')
  if (!user) {
    throw new HTTPException(401, { message: 'Unauthorized' })
  }
  return c.json({ user })
})

export { auth }
