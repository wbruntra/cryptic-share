import { Router } from 'express'
import { authenticateUser, optionalAuthenticateUser } from '../middleware/auth'

import { SessionService } from '../services/sessionService'

const router = Router()

// Get all sessions for the authenticated user
router.get('/', authenticateUser, async (req, res) => {
  try {
    const sessions = await SessionService.getUserSessions(res.locals.user.id)
    res.json(sessions)
  } catch (error) {
    console.error('Error fetching user sessions:', error)
    res.status(500).json({ error: 'Failed to fetch sessions' })
  }
})

// Sync/Claim sessions (migrate local sessions to user)
router.post('/sync', authenticateUser, async (req, res) => {
  const { sessionIds } = req.body

  if (!Array.isArray(sessionIds)) {
    return res.status(400).json({ error: 'sessionIds must be an array' })
  }

  if (sessionIds.length === 0) {
    return res.json({ success: true, count: 0 })
  }

  try {
    const count = await SessionService.syncSessions(res.locals.user.id, sessionIds)
    res.json({ success: true, count })
  } catch (error) {
    console.error('Error syncing sessions:', error)
    res.status(500).json({ error: 'Failed to sync sessions' })
  }
})

// Create a new session
router.post('/', optionalAuthenticateUser, async (req, res) => {
  const { puzzleId, anonymousId } = req.body
  if (!puzzleId) {
    return res.status(400).json({ error: 'Missing puzzleId' })
  }

  try {
    const sessionId = await SessionService.createOrResetSession(
      res.locals.user?.id || null,
      puzzleId,
      anonymousId,
    )
    res.status(201).json({ sessionId })
  } catch (error) {
    console.error('Error creating session:', error)
    res.status(500).json({ error: 'Failed to create session' })
  }
})

// Get session details (puzzle + state)
router.get('/:sessionId', async (req, res) => {
  const { sessionId } = req.params

  try {
    const result = await SessionService.getSessionWithPuzzle(sessionId)

    if (!result) {
      return res.status(404).json({ error: 'Session or puzzle not found' })
    }

    res.json(result)
  } catch (error) {
    console.error('Error fetching session:', error)
    res.status(500).json({ error: 'Failed to fetch session' })
  }
})

// Update session state
router.put('/:sessionId', async (req, res) => {
  const { sessionId } = req.params
  const { state } = req.body

  if (state === undefined) {
    return res.status(400).json({ error: 'Missing state' })
  }

  try {
    const updated = await SessionService.updateSessionState(sessionId, state)

    if (!updated) {
      return res.status(404).json({ error: 'Session not found' })
    }

    res.json({ success: true })
  } catch (error) {
    console.error('Error updating session:', error)
    res.status(500).json({ error: 'Failed to update session' })
  }
})

export default router
