import { Router, jsonResponse, HttpError, type Context } from '../http/router'
import { requireAdmin } from '../middleware/auth'
import { SessionService } from '../services/sessionService'

export function registerAdminSessionRoutes(router: Router) {
  router.get('/api/admin/sessions', handleGetAllSessions)
  router.delete('/api/admin/sessions/:sessionId', handleDeleteSession)
}

// Get all sessions with details (admin only)
async function handleGetAllSessions(ctx: Context) {
  requireAdmin(ctx)

  try {
    const sessions = await SessionService.getAllSessionsWithDetails()
    return jsonResponse(sessions)
  } catch (error) {
    console.error('Error fetching sessions:', error)
    throw new HttpError(500, { error: 'Failed to fetch sessions' })
  }
}

// Delete a session (admin only)
async function handleDeleteSession(ctx: Context) {
  requireAdmin(ctx)
  const { sessionId } = ctx.params as any

  if (!sessionId) {
    throw new HttpError(400, { error: 'Session ID is required' })
  }

  try {
    const deleted = await SessionService.deleteSession(sessionId)

    if (!deleted) {
      throw new HttpError(404, { error: 'Session not found' })
    }

    return jsonResponse({ success: true, sessionId })
  } catch (error: any) {
    if (error instanceof HttpError) throw error
    console.error('Error deleting session:', error)
    throw new HttpError(500, { error: 'Failed to delete session' })
  }
}
