import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { adminMiddleware, type AuthUser } from '../hono-middleware/auth'
import { SessionService } from '../services/sessionService'

type Variables = { user: AuthUser | null }

const adminSessions = new Hono<{ Variables: Variables }>()

adminSessions.use('*', adminMiddleware)

// GET /api/admin/sessions - Get all sessions with details
adminSessions.get('/', async (c) => {
  try {
    const allSessions = await SessionService.getAllSessionsWithDetails()
    return c.json(allSessions)
  } catch (error) {
    console.error('Error fetching sessions:', error)
    throw new HTTPException(500, { message: 'Failed to fetch sessions' })
  }
})

// DELETE /api/admin/sessions/:sessionId
adminSessions.delete('/:sessionId', async (c) => {
  const sessionId = c.req.param('sessionId')

  if (!sessionId) {
    throw new HTTPException(400, { message: 'Session ID is required' })
  }

  try {
    const deleted = await SessionService.deleteSession(sessionId)

    if (!deleted) {
      throw new HTTPException(404, { message: 'Session not found' })
    }

    return c.json({ success: true, sessionId })
  } catch (error: any) {
    if (error instanceof HTTPException) throw error
    console.error('Error deleting session:', error)
    throw new HTTPException(500, { message: 'Failed to delete session' })
  }
})

export { adminSessions }
