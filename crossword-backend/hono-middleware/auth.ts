import { HTTPException } from 'hono/http-exception'
import type { Context, Next } from 'hono'

// Types that match the existing auth system
export interface AuthUser {
  id: number | string
  username: string
  isAdmin?: boolean
}

/**
 * Get user from context (set by auth middleware in hono-app.ts)
 */
export function getUser(c: Context): AuthUser | null {
  return c.get('user') as AuthUser | null
}

/**
 * Require authentication - throws 401 if not authenticated
 */
export function requireAuth(c: Context): AuthUser {
  const user = getUser(c)
  if (!user) {
    throw new HTTPException(401, { message: 'Unauthorized' })
  }
  return user
}

/**
 * Require admin - throws 401 if not authenticated, 403 if not admin
 */
export function requireAdmin(c: Context): AuthUser {
  const user = requireAuth(c)
  if (!user.isAdmin) {
    throw new HTTPException(403, { message: 'Forbidden' })
  }
  return user
}

import { createMiddleware } from 'hono/factory'

/**
 * Optional authentication - returns user or null
 */
export function optionalAuth(c: Context): AuthUser | null {
  return getUser(c)
}

/**
 * Middleware: Require authentication
 */
export const authMiddleware = createMiddleware(async (c, next) => {
  requireAuth(c)
  await next()
})

/**
 * Middleware: Require admin
 */
export const adminMiddleware = createMiddleware(async (c, next) => {
  requireAdmin(c)
  await next()
})
