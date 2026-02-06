import { Router, jsonResponse, HttpError, type Context } from '../http/router'
import { AuthService } from '../services/authService'
import { requireUser } from '../middleware/auth'

export function registerAuthRoutes(router: Router) {
  router.post('/api/auth/login', handleLogin)
  router.post('/api/auth/register', handleRegister)
  router.get('/api/auth/me', handleMe)
}

async function handleLogin(ctx: Context) {
  const body = ctx.body as any
  const { username, password } = body || {}

  if (!username || !password) {
    throw new HttpError(400, { error: 'Username and password are required' })
  }

  try {
    const result = await AuthService.login(username, password)
    return jsonResponse(result)
  } catch (error: any) {
    if (error.message === 'Invalid credentials') {
      throw new HttpError(401, { error: error.message })
    }
    console.error('Login error:', error)
    throw new HttpError(500, { error: 'Login failed' })
  }
}

async function handleRegister(ctx: Context) {
  const body = ctx.body as any
  const { username, password } = body || {}

  if (!username || !password) {
    throw new HttpError(400, { error: 'Username and password are required' })
  }

  try {
    const result = await AuthService.register(username, password)
    return jsonResponse(result)
  } catch (error: any) {
    if (error.message === 'Username already exists') {
      throw new HttpError(400, { error: error.message })
    }
    console.error('Registration error:', error)
    throw new HttpError(500, { error: 'Registration failed' })
  }
}

function handleMe(ctx: Context) {
  const user = requireUser(ctx)
  return jsonResponse({ user })
}
