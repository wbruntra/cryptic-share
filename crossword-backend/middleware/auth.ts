import jwt from 'jsonwebtoken'
import { JWT_SECRET } from '../config'
import { HttpError, type AuthUser, type Context } from '../http/router'

export function getAuthUser(req: Request): AuthUser | null {
  const authHeader = req.headers.get('authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!token) {
    return null
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthUser
    console.log(`[AUTH] User authenticated: ${decoded.username} (id: ${decoded.id}, isAdmin: ${decoded.isAdmin})`)
    return decoded
  } catch (error) {
    console.error(`[AUTH] JWT verification failed:`, error instanceof Error ? error.message : error)
    return null
  }
}

export function authenticateUser(ctx: Context): AuthUser {
  const user = ctx.user
  if (!user) {
    throw new HttpError(401, { error: 'Unauthorized' })
  }
  return user
}

export function optionalAuthenticateUser(ctx: Context): AuthUser | null {
  return ctx.user || null
}

export function requireUser(ctx: Context): AuthUser {
  if (!ctx.user) {
    console.error(`[AUTH] No user found in context. Authorization header present: ${!!ctx.req.headers.get('authorization')}`)
    throw new HttpError(401, { error: 'Unauthorized' })
  }
  return ctx.user
}

export function requireAdmin(ctx: Context): AuthUser {
  const user = requireUser(ctx)
  if (!user.isAdmin) {
    console.error(`[AUTH] Admin access denied for user ${user.id} (${user.username}). isAdmin: ${user.isAdmin}`)
    throw new HttpError(403, { error: 'Forbidden' })
  }
  return user
}

