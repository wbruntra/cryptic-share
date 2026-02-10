import crypto from 'crypto'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { HTTPException } from 'hono/http-exception'
import { requireAuth, optionalAuth, type AuthUser } from '../hono-middleware/auth'
import { SessionService } from '../services/sessionService'
import { SSEService } from '../services/sseService'
import { Broadcaster } from '../services/broadcaster'

type Variables = { user: AuthUser | null }

const sessions = new Hono<{ Variables: Variables }>()

// GET /api/sessions - Get all sessions for authenticated user
sessions.get('/', async (c) => {
  const user = requireAuth(c)

  try {
    const userSessions = await SessionService.getUserAndFriendsSessions(user.id as number)
    return c.json(userSessions)
  } catch (error) {
    console.error('Error fetching user sessions:', error)
    throw new HTTPException(500, { message: 'Failed to fetch sessions' })
  }
})

// POST /api/sessions/sync - Sync/Claim sessions
sessions.post('/sync', async (c) => {
  const user = requireAuth(c)
  const body = await c.req.json().catch(() => ({}))
  const { sessionIds } = body

  if (!Array.isArray(sessionIds)) {
    throw new HTTPException(400, { message: 'sessionIds must be an array' })
  }

  if (sessionIds.length === 0) {
    return c.json({ success: true, count: 0 })
  }

  try {
    const count = await SessionService.syncSessions(user.id as number, sessionIds)
    return c.json({ success: true, count })
  } catch (error) {
    console.error('Error syncing sessions:', error)
    throw new HTTPException(500, { message: 'Failed to sync sessions' })
  }
})

// POST /api/sessions - Create a new session
sessions.post('/', async (c) => {
  const user = c.get('user')
  const body = await c.req.json().catch(() => ({}))
  const { puzzleId, anonymousId } = body

  if (!puzzleId) {
    throw new HTTPException(400, { message: 'Missing puzzleId' })
  }

  try {
    const sessionId = await SessionService.createOrResetSession(
      (user?.id as number | null) || null,
      puzzleId,
      anonymousId,
    )
    return c.json({ sessionId })
  } catch (error) {
    console.error('Error creating session:', error)
    throw new HTTPException(500, { message: 'Failed to create session' })
  }
})

// POST /api/sessions/go - Get existing session or create new one
sessions.post('/go', async (c) => {
  const user = c.get('user')
  const body = await c.req.json().catch(() => ({}))
  const { puzzleId, anonymousId } = body

  if (!puzzleId) {
    throw new HTTPException(400, { message: 'Missing puzzleId' })
  }

  console.log(
    `[/go] User: ${user?.username || 'anonymous'}, AnonymousId: ${
      anonymousId || 'none'
    }, PuzzleId: ${puzzleId}`,
  )

  try {
    const result = await SessionService.getOrCreateSession(
      (user?.id as number | null) || null,
      puzzleId,
      anonymousId,
    )
    // Return 201 if new, 200 if existing
    const statusCode = result.isNew ? 201 : 200
    return c.json(result, statusCode)
  } catch (error) {
    console.error('Error getting/creating session:', error)
    throw new HTTPException(500, { message: 'Failed to get or create session' })
  }
})

// GET /api/sessions/:sessionId - Get session details
sessions.get('/:sessionId', async (c) => {
  const sessionId = c.req.param('sessionId')

  try {
    const result = await SessionService.getSessionWithPuzzle(sessionId)

    if (!result) {
      throw new HTTPException(404, { message: 'Session or puzzle not found' })
    }

    return c.json(result)
  } catch (error: any) {
    if (error instanceof HTTPException) throw error
    console.error('Error fetching session:', error)
    throw new HTTPException(500, { message: 'Failed to fetch session' })
  }
})

// PUT /api/sessions/:sessionId - Update session state
sessions.put('/:sessionId', async (c) => {
  const sessionId = c.req.param('sessionId')
  const body = await c.req.json().catch(() => ({}))
  const { state } = body

  if (state === undefined) {
    throw new HTTPException(400, { message: 'Missing state' })
  }

  try {
    const updated = await SessionService.updateSessionState(sessionId, state)

    if (!updated) {
      throw new HTTPException(404, { message: 'Session not found' })
    }

    return c.json({ success: true })
  } catch (error: any) {
    if (error instanceof HTTPException) throw error
    console.error('Error updating session:', error)
    throw new HTTPException(500, { message: 'Failed to update session' })
  }
})

// POST /api/sessions/:sessionId/check - Check answers
sessions.post('/:sessionId/check', async (c) => {
  const sessionId = c.req.param('sessionId')

  try {
    const session = await SessionService.getSessionWithPuzzle(sessionId)
    if (!session) {
      throw new HTTPException(404, { message: 'Session not found' })
    }

    const { checkSessionAnswers } = await import('../utils/answerChecker')
    const { results } = await checkSessionAnswers(session.id, session.sessionState)

    const incorrect = results.filter((r) => !r.isCorrect)
    const errorCells: string[] = []
    incorrect.forEach((item) => {
      item.cells.forEach((cell) => {
        errorCells.push(`${cell.r}-${cell.c}`)
      })
    })

    return c.json({ success: true, incorrectCount: incorrect.length, errorCells })
  } catch (error) {
    console.error('Error checking session:', error)
    throw new HTTPException(500, { message: 'Failed to check session' })
  }
})

// POST /api/sessions/:sessionId/hint - Get hint
sessions.post('/:sessionId/hint', async (c) => {
  const sessionId = c.req.param('sessionId')
  const body = await c.req.json().catch(() => ({}))
  const { type, target, dryRun } = body

  if (!type || !target) {
    throw new HTTPException(400, { message: 'Missing type or target' })
  }

  try {
    const session = await SessionService.getSessionWithPuzzle(sessionId)
    if (!session) {
      throw new HTTPException(404, { message: 'Session not found' })
    }

    const { getCorrectAnswersStructure, rot13, extractClueMetadata } = await import(
      '../utils/answerChecker'
    )
    const { puzzle, puzzleAnswers } = await getCorrectAnswersStructure(session.id)

    if (!puzzleAnswers) {
      throw new HTTPException(400, { message: 'No answers available for this puzzle' })
    }

    let valueToReveal = ''

    if (type === 'letter') {
      const { r, c } = target
      const grid = puzzle.grid.split('\n').map((row: string) => row.trim().split(' ') as any[])
      const metadata = extractClueMetadata(grid)

      let found = false
      for (const item of metadata) {
        let cr = item.row
        let cc = item.col
        let index = 0
        while (cr < grid.length && cc < grid[0].length && grid[cr][cc] !== 'B') {
          if (cr === r && cc === c) {
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
        throw new HTTPException(404, { message: 'Answer not found for this cell' })
      }

      if (dryRun) {
        return c.json({ success: true, value: valueToReveal })
      }

      await SessionService.updateCell(sessionId, r, c, valueToReveal)
    } else if (type === 'word') {
      const { number, direction } = target
      const list = puzzleAnswers[direction]
      const answerEntry = list?.find((a: any) => a.number === number)

      if (!answerEntry) {
        throw new HTTPException(404, { message: 'Answer not found for this clue' })
      }

      const decrypted = rot13(answerEntry.answer)
        .toUpperCase()
        .replace(/[^A-Z]/g, '')
      valueToReveal = decrypted

      const grid = puzzle.grid.split('\n').map((row: string) => row.trim().split(' ') as any[])
      const metadata = extractClueMetadata(grid)
      const clueInfo = metadata.find((m) => m.number === number && m.direction === direction)

      if (!clueInfo) {
        throw new HTTPException(404, { message: 'Clue not found in grid' })
      }

      let r = clueInfo.row
      let cc = clueInfo.col

      if (dryRun) {
        return c.json({ success: true, value: valueToReveal })
      }

      for (let i = 0; i < decrypted.length; i++) {
        await SessionService.updateCell(sessionId, r, cc, decrypted[i] || '')
        if (direction === 'across') cc++
        else r++
      }
    } else {
      throw new HTTPException(400, { message: 'Invalid hint type' })
    }

    return c.json({ success: true, value: valueToReveal })
  } catch (error: any) {
    if (error instanceof HTTPException) throw error
    console.error('Error providing hint:', error)
    throw new HTTPException(500, { message: 'Failed to provide hint' })
  }
})

// POST /api/sessions/:sessionId/explain - Get explanation for a clue
sessions.post('/:sessionId/explain', async (c) => {
  const user = c.get('user')
  const sessionId = c.req.param('sessionId')
  const body = await c.req.json().catch(() => ({}))
  const { clueNumber, direction, cachedOnly } = body

  if (!clueNumber || !direction) {
    throw new HTTPException(400, { message: 'Missing clueNumber or direction' })
  }

  const requestId = crypto.randomUUID()

  try {
    const session = await SessionService.getSessionWithPuzzle(sessionId)
    if (!session) {
      throw new HTTPException(404, { message: 'Session not found' })
    }

    const { ExplanationService } = await import('../services/explanationService')
    const cached = await ExplanationService.getCachedExplanation(session.id, clueNumber, direction)

    if (cached) {
      return c.json({ success: true, explanation: cached, cached: true })
    }

    if (cachedOnly) {
      throw new HTTPException(404, {
        message: 'Explanation not cached yet',
      })
    }

    if (!user) {
      throw new HTTPException(401, {
        message: 'Authentication required to generate new explanations',
      })
    }

    // Return 202 immediately and process in background
    setImmediate(async () => {
      try {
        const { getCorrectAnswersStructure, rot13 } = await import('../utils/answerChecker')
        const { puzzleAnswers } = await getCorrectAnswersStructure(session.id)

        if (!puzzleAnswers) {
          return
        }

        const clueList = direction === 'across' ? session.clues.across : session.clues.down
        const clueEntry = clueList?.find((c: any) => c.number === clueNumber)
        if (!clueEntry) return

        const answerList = puzzleAnswers[direction]
        const answerEntry = answerList?.find((a: any) => a.number === clueNumber)
        if (!answerEntry) return

        const decryptedAnswer = rot13(answerEntry.answer)
          .toUpperCase()
          .replace(/[^A-Z]/g, '')

        const { ExplanationService: ES } = await import('../services/explanationService')
        const { explanation } = await ES.getOrCreateExplanation(
          session.id,
          clueNumber,
          direction,
          clueEntry.clue,
          decryptedAnswer,
        )

        await Broadcaster.broadcast(sessionId, 'explanation_ready', {
          requestId,
          clueNumber,
          direction,
          explanation,
          success: true,
        })
      } catch (error) {
        console.error('Background explanation error:', error)
        try {
          await Broadcaster.broadcast(sessionId, 'explanation_ready', {
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

    return c.json(
      {
        success: true,
        processing: true,
        requestId,
        message: 'Explanation is being generated...',
      },
      202,
    )
  } catch (error: any) {
    if (error instanceof HTTPException) throw error
    console.error('Error providing explanation:', error)
    throw new HTTPException(500, { message: 'Failed to provide explanation' })
  }
})

// POST /api/sessions/:sessionId/report-explanation - Report bad explanation
sessions.post('/:sessionId/report-explanation', async (c) => {
  const user = c.get('user')
  const sessionId = c.req.param('sessionId')
  const body = await c.req.json().catch(() => ({}))
  const { clueNumber, direction, feedback } = body

  if (!clueNumber || !direction) {
    throw new HTTPException(400, { message: 'Missing clueNumber or direction' })
  }

  try {
    const session = await SessionService.getSessionWithPuzzle(sessionId)
    if (!session) {
      throw new HTTPException(404, { message: 'Session not found' })
    }

    const userId = (user?.id as number) || null
    const anonymousId = session.anonymous_id || null

    const db = (await import('../db-knex')).default
    await db('explanation_reports').insert({
      puzzle_id: session.id,
      clue_number: clueNumber,
      direction,
      user_id: userId,
      anonymous_id: anonymousId,
      feedback: feedback || null,
    })

    return c.json({ success: true, message: 'Report submitted successfully' })
  } catch (error: any) {
    if (error instanceof HTTPException) throw error
    console.error('Error reporting explanation:', error)
    throw new HTTPException(500, { message: 'Failed to submit report' })
  }
})

// POST /api/sessions/:sessionId/claim - Claim a word
sessions.post('/:sessionId/claim', async (c) => {
  const sessionId = c.req.param('sessionId')
  const body = await c.req.json().catch(() => ({}))
  const { clueKey, userId, username } = body

  if (!sessionId || !clueKey || !username) {
    throw new HTTPException(400, { message: 'Missing sessionId, clueKey, or username' })
  }

  try {
    const claimed = await SessionService.recordWordAttribution(
      sessionId,
      clueKey,
      userId || null,
      username,
    )

    if (claimed) {
      const timestamp = new Date().toISOString()

      await Broadcaster.broadcast(sessionId, 'word_claimed', {
        clueKey,
        userId: userId || null,
        username,
        timestamp,
      })
    }

    return c.json({ success: true, claimed })
  } catch (error: any) {
    if (error instanceof HTTPException) throw error
    console.error('Error claiming word via HTTP:', error)
    throw new HTTPException(500, { message: 'Failed to claim word' })
  }
})

// GET /api/sessions/:sessionId/events - SSE endpoint
sessions.get('/:sessionId/events', async (c) => {
  const sessionId = c.req.param('sessionId')

  return streamSSE(c, async (stream) => {
    let clientId: string | null = null

    // Create writer interface for SSEService
    const writer = {
      write(data: string) {
        stream.write(data)
      },
    } as any

    // Add client to SSE service
    clientId = SSEService.addClient(sessionId, writer)

    // Send initial connection message
    await stream.writeSSE({
      event: 'connection_established',
      data: JSON.stringify({ socketId: clientId }),
    })

    // Send initial puzzle snapshot
    try {
      const state = await SessionService.getSessionState(sessionId)
      if (state) {
        await stream.writeSSE({
          event: 'puzzle_updated',
          data: JSON.stringify({ state }),
        })
      }
    } catch (error) {
      console.error('Error sending session snapshot on SSE connect:', error)
    }

    // Keep connection alive until client disconnects
    stream.onAbort(() => {
      if (clientId) {
        SSEService.removeClient(clientId)
      }
    })

    // Keep the connection open
    while (true) {
      await stream.sleep(30000) // Sleep for 30 seconds
    }
  })
})

// POST /api/sessions/:sessionId/cell - Update single cell
sessions.post('/:sessionId/cell', async (c) => {
  const sessionId = c.req.param('sessionId')
  const body = await c.req.json().catch(() => ({}))
  const { r, c: col, value } = body

  if (r === undefined || col === undefined || value === undefined) {
    throw new HTTPException(400, { message: 'Missing r, c, or value' })
  }

  try {
    await SessionService.updateCell(sessionId, r, col, value)

    const senderId = c.req.query('socketId') || 'REST_API'
    await Broadcaster.broadcastCellUpdate(sessionId, r, col, value, senderId)

    return c.json({ success: true })
  } catch (error) {
    console.error('Error updating cell:', error)
    throw new HTTPException(500, { message: 'Failed to update cell' })
  }
})

export { sessions }
