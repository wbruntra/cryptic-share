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

// Create a new session (or reset existing one - legacy behavior)
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

// Go to puzzle - gets existing session or creates new one (does NOT reset)
router.post('/go', optionalAuthenticateUser, async (req, res) => {
  const { puzzleId, anonymousId } = req.body
  if (!puzzleId) {
    return res.status(400).json({ error: 'Missing puzzleId' })
  }

  try {
    const result = await SessionService.getOrCreateSession(
      res.locals.user?.id || null,
      puzzleId,
      anonymousId,
    )
    res.status(result.isNew ? 201 : 200).json(result)
  } catch (error) {
    console.error('Error getting/creating session:', error)
    res.status(500).json({ error: 'Failed to get or create session' })
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

// Check session answers
router.post('/:sessionId/check', async (req, res) => {
  const { sessionId } = req.params

  try {
    const session = await SessionService.getSessionWithPuzzle(sessionId)
    if (!session) {
      return res.status(404).json({ error: 'Session not found' })
    }

    const { checkSessionAnswers } = await import('../utils/answerChecker')
    // session is the puzzle object + sessionState, so the ID is session.id
    const { results, totalClues, totalLetters, filledLetters } = await checkSessionAnswers(
      session.id,
      session.sessionState,
    )

    // Filter to return only incorrect answers with their cells
    const incorrect = results.filter((r) => !r.isCorrect)

    // For privacy/spoiler prevention, we might mostly care about WHICH cells are wrong.
    // We return the raw results or a simplified list of incorrect cells?
    // Let's return the full results (filtered for incorrect) so frontend can decide.
    // Flatten to a list of "error cells" for easy highlighting
    const errorCells: string[] = []
    incorrect.forEach((item) => {
      item.cells.forEach((cell) => {
        errorCells.push(`${cell.r}-${cell.c}`)
      })
    })

    res.json({ success: true, incorrectCount: incorrect.length, errorCells })
  } catch (error) {
    console.error('Error checking session:', error)
    res.status(500).json({ error: 'Failed to check session' })
  }
})

// Get hint (reveal letter or word)
router.post('/:sessionId/hint', async (req, res) => {
  const { sessionId } = req.params
  const { type, target } = req.body

  if (!type || !target) {
    return res.status(400).json({ error: 'Missing type or target' })
  }

  try {
    const session = await SessionService.getSessionWithPuzzle(sessionId)
    if (!session) {
      return res.status(404).json({ error: 'Session not found' })
    }

    const { getCorrectAnswersStructure, rot13, extractClueMetadata } = await import(
      '../utils/answerChecker'
    )
    const { puzzle, puzzleAnswers } = await getCorrectAnswersStructure(session.id)

    if (!puzzleAnswers) {
      return res.status(400).json({ error: 'No answers available for this puzzle' })
    }

    let valueToReveal = ''

    if (type === 'letter') {
      const { r, c } = target
      // Find which word this cell belongs to (could be across or down) to look up the answer.
      // Or search both.
      // Actually we have the grid structure, we can find the clue number for this cell.
      // But a cell can belong to two clues.
      // We need to find *any* correct letter for this position.
      // Strategy: Iterate all answers, map them to grid, see if any covers (r, c).

      const grid = puzzle.grid
        .split('\n')
        .map((row: string) => row.trim().split(' ') as any[])
      const metadata = extractClueMetadata(grid)

      // Find a clue that covers this cell
      let found = false
      for (const item of metadata) {
        // Trace word path
        let cr = item.row
        let cc = item.col
        let index = 0
        const cells = []
        while (cr < grid.length && cc < grid[0].length && grid[cr][cc] !== 'B') {
          if (cr === r && cc === c) {
            // This clue covers our cell at index `index`
            const list = puzzleAnswers[item.direction]
            const answerEntry = list?.find((a: any) => a.number === item.number)
            if (answerEntry) {
              const decrypted = rot13(answerEntry.answer).toUpperCase()
              valueToReveal = decrypted[index]
              found = true
              break
            }
          }
          if (item.direction === 'across') cc++
          else cr++
          index++
        }
        if (found) break
      }

      if (!found) {
        return res.status(404).json({ error: 'Answer not found for this cell' })
      }

      // Update session
      await SessionService.updateCell(sessionId, r, c, valueToReveal)
    } else if (type === 'word') {
      const { number, direction } = target
      const list = puzzleAnswers[direction]
      const answerEntry = list?.find((a: any) => a.number === number)

      if (!answerEntry) {
        return res.status(404).json({ error: 'Answer not found for this clue' })
      }

      const decrypted = rot13(answerEntry.answer).toUpperCase()
      valueToReveal = decrypted

      // We need to know where to start writing.
      // Re-extract metadata to find start row/col for this clue number/direction
      const grid = puzzle.grid
        .split('\n')
        .map((row: string) => row.trim().split(' ') as any[])
      const metadata = extractClueMetadata(grid)
      const clueInfo = metadata.find((m) => m.number === number && m.direction === direction)

      if (!clueInfo) {
        return res.status(404).json({ error: 'Clue not found in grid' })
      }

      // Update each cell of the word
      let r = clueInfo.row
      let c = clueInfo.col
      for (let i = 0; i < decrypted.length; i++) {
        await SessionService.updateCell(sessionId, r, c, decrypted[i])
        if (direction === 'across') c++
        else r++
      }
    } else {
      return res.status(400).json({ error: 'Invalid hint type' })
    }

    // Return the revealed value (and updated state if needed, but socket handles that)
    res.json({ success: true, value: valueToReveal })
  } catch (error) {
    console.error('Error providing hint:', error)
    res.status(500).json({ error: 'Failed to provide hint' })
  }
})

export default router
