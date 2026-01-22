import { Router } from 'express'
import crypto from 'crypto'
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

  console.log(`[/go] User: ${res.locals.user?.username || 'anonymous'}, AnonymousId: ${anonymousId || 'none'}, PuzzleId: ${puzzleId}`)

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

      const grid = puzzle.grid.split('\n').map((row: string) => row.trim().split(' ') as any[])
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
              const decrypted = rot13(answerEntry.answer)
                .toUpperCase()
                .replace(/[^A-Z]/g, '')
              valueToReveal = decrypted[index] || ''
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

      if (req.body.dryRun) {
        return res.json({ success: true, value: valueToReveal })
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

      const decrypted = rot13(answerEntry.answer)
        .toUpperCase()
        .replace(/[^A-Z]/g, '')
      valueToReveal = decrypted

      // We need to know where to start writing.
      // Re-extract metadata to find start row/col for this clue number/direction
      const grid = puzzle.grid.split('\n').map((row: string) => row.trim().split(' ') as any[])
      const metadata = extractClueMetadata(grid)
      const clueInfo = metadata.find((m) => m.number === number && m.direction === direction)

      if (!clueInfo) {
        return res.status(404).json({ error: 'Clue not found in grid' })
      }

      // Update each cell of the word
      let r = clueInfo.row
      let c = clueInfo.col

      if (req.body.dryRun) {
        return res.json({ success: true, value: valueToReveal })
      }

      for (let i = 0; i < decrypted.length; i++) {
        await SessionService.updateCell(sessionId, r, c, decrypted[i] || '')
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

// Get explanation for a clue (uses OpenAI, cached in database)
router.post('/:sessionId/explain', optionalAuthenticateUser, async (req, res) => {
  const { sessionId } = req.params
  const { clueNumber, direction, cachedOnly } = req.body

  if (!clueNumber || !direction) {
    return res.status(400).json({ error: 'Missing clueNumber or direction' })
  }

  // Generate a request ID to track this specific request
  const requestId = crypto.randomUUID()

  try {
    const session = await SessionService.getSessionWithPuzzle(sessionId)
    if (!session) {
      return res.status(444).json({ error: 'Session not found' })
    }

    // Check cache synchronously
    const { ExplanationService } = await import('../services/explanationService')
    const cached = await ExplanationService.getCachedExplanation(session.id, clueNumber, direction)

    if (cached) {
      return res.json({ success: true, explanation: cached, cached: true })
    }

    // If cachedOnly mode, return not found instead of generating
    if (cachedOnly) {
      return res.status(404).json({ 
        success: false, 
        cached: false,
        message: 'Explanation not cached yet'
      })
    }

    // Not cached - require authentication to generate new explanation
    if (!res.locals.user) {
      return res.status(401).json({ 
        error: 'Authentication required to generate new explanations',
        cached: false 
      })
    }

    // Not cached - return 202 immediately and process in background
    res.status(202).json({
      success: true,
      processing: true,
      requestId,
      message: 'Explanation is being generated...',
    })

    // Background processing
    setImmediate(async () => {
      try {
        const { getCorrectAnswersStructure, rot13 } = await import('../utils/answerChecker')
        const { puzzleAnswers } = await getCorrectAnswersStructure(session.id)

        if (!puzzleAnswers) {
          // Should emit error via socket
          return
        }

        // Get the clue text
        const clueList = direction === 'across' ? session.clues.across : session.clues.down
        const clueEntry = clueList?.find((c: any) => c.number === clueNumber)
        if (!clueEntry) return

        // Get the answer
        const answerList = puzzleAnswers[direction]
        const answerEntry = answerList?.find((a: any) => a.number === clueNumber)
        if (!answerEntry) return

        const decryptedAnswer = rot13(answerEntry.answer)
          .toUpperCase()
          .replace(/[^A-Z]/g, '')

        // This will now call OpenAI (slow)
        const { ExplanationService } = await import('../services/explanationService')
        const { explanation } = await ExplanationService.getOrCreateExplanation(
          session.id,
          clueNumber,
          direction,
          clueEntry.clue,
          decryptedAnswer,
        )

        // Import io dynamically to avoid circular dependency issues if possible,
        // or rely on the fact that app.ts exports it.
        // For now, let's assume we can import it.
        const { io } = await import('../app')

        console.log(
          '[Explain] Emitting explanation_ready to room:',
          sessionId,
          'requestId:',
          requestId,
        )
        io.to(sessionId as string).emit('explanation_ready', {
          requestId,
          clueNumber,
          direction,
          explanation,
          success: true,
        })
      } catch (error) {
        console.error('Background explanation error:', error)
        try {
          const { io } = await import('../app')
          io.to(sessionId as string).emit('explanation_ready', {
            requestId,
            clueNumber,
            direction,
            success: false,
            error: 'Failed to generate explanation',
          })
        } catch (e) {
          console.error('Failed to emit error socket event:', e)
        }
      }
    })
  } catch (error) {
    console.error('Error providing explanation:', error)
    // If headers haven't been sent, we can send error
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to provide explanation' })
    }
  }
})

// Report a bad explanation
router.post('/:sessionId/report-explanation', optionalAuthenticateUser, async (req, res) => {
  const { sessionId } = req.params
  const { clueNumber, direction, feedback } = req.body

  if (!clueNumber || !direction) {
    return res.status(400).json({ error: 'Missing clueNumber or direction' })
  }

  try {
    const session = await SessionService.getSessionWithPuzzle(sessionId)
    if (!session) {
      return res.status(444).json({ error: 'Session not found' })
    }

    // Extract user or anonymous ID
    const userId = res.locals.user?.id || null
    const anonymousId = session.anonymous_id || null

    // Insert report into database
    const db = (await import('../db-knex')).default
    await db('explanation_reports').insert({
      puzzle_id: session.id,
      clue_number: clueNumber,
      direction,
      user_id: userId,
      anonymous_id: anonymousId,
      feedback: feedback || null,
    })

    res.json({ success: true, message: 'Report submitted successfully' })
  } catch (error) {
    console.error('Error reporting explanation:', error)
    res.status(500).json({ error: 'Failed to submit report' })
  }
})

export default router
