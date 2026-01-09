import { Router } from 'express'
import { requireAdmin } from '../middleware/auth'
import { SessionService } from '../services/sessionService'

const router = Router()

// Get all sessions with details (admin only)
router.get('/', requireAdmin, async (req, res) => {
  try {
    const sessions = await SessionService.getAllSessionsWithDetails()
    res.json(sessions)
  } catch (error) {
    console.error('Error fetching sessions:', error)
    res.status(500).json({ error: 'Failed to fetch sessions' })
  }
})

// Delete a session (admin only)
router.delete('/:sessionId', requireAdmin, async (req, res) => {
  const { sessionId } = req.params

  if (!sessionId) {
    return res.status(400).json({ error: 'Session ID is required' })
  }

  try {
    const deleted = await SessionService.deleteSession(sessionId)

    if (!deleted) {
      return res.status(404).json({ error: 'Session not found' })
    }

    res.json({ success: true, sessionId })
  } catch (error) {
    console.error('Error deleting session:', error)
    res.status(500).json({ error: 'Failed to delete session' })
  }
})

export default router
