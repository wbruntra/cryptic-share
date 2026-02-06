import crypto from 'crypto'
import { Router, jsonResponse, HttpError, type Context } from '../http/router'
import { authenticateUser, optionalAuthenticateUser } from '../middleware/auth'
import { SessionService } from '../services/sessionService'

export function registerSessionRoutes(router: Router) {
  router.get('/api/sessions', handleGetUserSessions)
  router.post('/api/sessions/sync', handleSyncSessions)
  router.post('/api/sessions', handleCreateSession)
  router.post('/api/sessions/go', handleGoToPuzzle)
  router.get('/api/sessions/:sessionId', handleGetSession)
  router.put('/api/sessions/:sessionId', handleUpdateSession)
  router.post('/api/sessions/:sessionId/check', handleCheckAnswers)
  router.post('/api/sessions/:sessionId/hint', handleGetHint)
  router.post('/api/sessions/:sessionId/explain', handleExplainClue)
  router.post('/api/sessions/:sessionId/report-explanation', handleReportExplanation)
  router.post('/api/sessions/:sessionId/claim', handleClaimWord)
}

// Get all sessions for the authenticated user
async function handleGetUserSessions(ctx: Context) {
  const user = authenticateUser(ctx)

  try {
    const sessions = await SessionService.getUserAndFriendsSessions(user.id as number)
    return jsonResponse(sessions)
  } catch (error) {
    console.error('Error fetching user sessions:', error)
    throw new HttpError(500, { error: 'Failed to fetch sessions' })
  }
}

// Sync/Claim sessions (migrate local sessions to user)
async function handleSyncSessions(ctx: Context) {
  const user = authenticateUser(ctx)
  const { sessionIds } = (ctx.body as any) || {}

  if (!Array.isArray(sessionIds)) {
    throw new HttpError(400, { error: 'sessionIds must be an array' })
  }

  if (sessionIds.length === 0) {
    return jsonResponse({ success: true, count: 0 })
  }

  try {
    const count = await SessionService.syncSessions(user.id as number, sessionIds)
    return jsonResponse({ success: true, count })
  } catch (error) {
    console.error('Error syncing sessions:', error)
    throw new HttpError(500, { error: 'Failed to sync sessions' })
  }
}

// Create a new session (or reset existing one - legacy behavior)
async function handleCreateSession(ctx: Context) {
  const user = optionalAuthenticateUser(ctx)
  const { puzzleId, anonymousId } = (ctx.body as any) || {}

  if (!puzzleId) {
    throw new HttpError(400, { error: 'Missing puzzleId' })
  }

  try {
    const sessionId = await SessionService.createOrResetSession(
      user?.id as number | null || null,
      puzzleId,
      anonymousId,
    )
    return jsonResponse({ sessionId })
  } catch (error) {
    console.error('Error creating session:', error)
    throw new HttpError(500, { error: 'Failed to create session' })
  }
}

// Go to puzzle - gets existing session or creates new one (does NOT reset)
async function handleGoToPuzzle(ctx: Context) {
  const user = optionalAuthenticateUser(ctx)
  const { puzzleId, anonymousId } = (ctx.body as any) || {}

  if (!puzzleId) {
    throw new HttpError(400, { error: 'Missing puzzleId' })
  }

  console.log(`[/go] User: ${user?.username || 'anonymous'}, AnonymousId: ${anonymousId || 'none'}, PuzzleId: ${puzzleId}`)

  try {
    const result = await SessionService.getOrCreateSession(
      user?.id as number | null || null,
      puzzleId,
      anonymousId,
    )
    // Return 201 if new, 200 if existing
    const statusCode = result.isNew ? 201 : 200
    return new Response(JSON.stringify(result), {
      status: statusCode,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Error getting/creating session:', error)
    throw new HttpError(500, { error: 'Failed to get or create session' })
  }
}

// Get session details (puzzle + state)
async function handleGetSession(ctx: Context) {
  const { sessionId } = ctx.params as any

  try {
    const result = await SessionService.getSessionWithPuzzle(sessionId)

    if (!result) {
      throw new HttpError(404, { error: 'Session or puzzle not found' })
    }

    return jsonResponse(result)
  } catch (error: any) {
    if (error instanceof HttpError) throw error
    console.error('Error fetching session:', error)
    throw new HttpError(500, { error: 'Failed to fetch session' })
  }
}

// Update session state
async function handleUpdateSession(ctx: Context) {
  const { sessionId } = ctx.params as any
  const body = ctx.body as any
  const { state } = body || {}

  if (state === undefined) {
    throw new HttpError(400, { error: 'Missing state' })
  }

  try {
    const updated = await SessionService.updateSessionState(sessionId, state)

    if (!updated) {
      throw new HttpError(404, { error: 'Session not found' })
    }

    return jsonResponse({ success: true })
  } catch (error: any) {
    if (error instanceof HttpError) throw error
    console.error('Error updating session:', error)
    throw new HttpError(500, { error: 'Failed to update session' })
  }
}

// Check session answers
async function handleCheckAnswers(ctx: Context) {
  const { sessionId } = ctx.params as any

  try {
    const session = await SessionService.getSessionWithPuzzle(sessionId)
    if (!session) {
      throw new HttpError(404, { error: 'Session not found' })
    }

    const { checkSessionAnswers } = await import('../utils/answerChecker')
    const { results, totalClues, totalLetters, filledLetters } = await checkSessionAnswers(
      session.id,
      session.sessionState,
    )

    const incorrect = results.filter((r) => !r.isCorrect)
    const errorCells: string[] = []
    incorrect.forEach((item) => {
      item.cells.forEach((cell) => {
        errorCells.push(`${cell.r}-${cell.c}`)
      })
    })

    return jsonResponse({ success: true, incorrectCount: incorrect.length, errorCells })
  } catch (error) {
    console.error('Error checking session:', error)
    throw new HttpError(500, { error: 'Failed to check session' })
  }
}

// Get hint (reveal letter or word)
async function handleGetHint(ctx: Context) {
  const { sessionId } = ctx.params as any
  const body = ctx.body as any
  const { type, target } = body || {}

  if (!type || !target) {
    throw new HttpError(400, { error: 'Missing type or target' })
  }

  try {
    const session = await SessionService.getSessionWithPuzzle(sessionId)
    if (!session) {
      throw new HttpError(404, { error: 'Session not found' })
    }

    const { getCorrectAnswersStructure, rot13, extractClueMetadata } = await import(
      '../utils/answerChecker'
    )
    const { puzzle, puzzleAnswers } = await getCorrectAnswersStructure(session.id)

    if (!puzzleAnswers) {
      throw new HttpError(400, { error: 'No answers available for this puzzle' })
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
        throw new HttpError(404, { error: 'Answer not found for this cell' })
      }

      if (body.dryRun) {
        return jsonResponse({ success: true, value: valueToReveal })
      }

      await SessionService.updateCell(sessionId, r, c, valueToReveal)
    } else if (type === 'word') {
      const { number, direction } = target
      const list = puzzleAnswers[direction]
      const answerEntry = list?.find((a: any) => a.number === number)

      if (!answerEntry) {
        throw new HttpError(404, { error: 'Answer not found for this clue' })
      }

      const decrypted = rot13(answerEntry.answer)
        .toUpperCase()
        .replace(/[^A-Z]/g, '')
      valueToReveal = decrypted

      const grid = puzzle.grid.split('\n').map((row: string) => row.trim().split(' ') as any[])
      const metadata = extractClueMetadata(grid)
      const clueInfo = metadata.find((m) => m.number === number && m.direction === direction)

      if (!clueInfo) {
        throw new HttpError(404, { error: 'Clue not found in grid' })
      }

      let r = clueInfo.row
      let c = clueInfo.col

      if (body.dryRun) {
        return jsonResponse({ success: true, value: valueToReveal })
      }

      for (let i = 0; i < decrypted.length; i++) {
        await SessionService.updateCell(sessionId, r, c, decrypted[i] || '')
        if (direction === 'across') c++
        else r++
      }
    } else {
      throw new HttpError(400, { error: 'Invalid hint type' })
    }

    return jsonResponse({ success: true, value: valueToReveal })
  } catch (error: any) {
    if (error instanceof HttpError) throw error
    console.error('Error providing hint:', error)
    throw new HttpError(500, { error: 'Failed to provide hint' })
  }
}

// Get explanation for a clue (uses OpenAI, cached in database)
async function handleExplainClue(ctx: Context) {
  const user = optionalAuthenticateUser(ctx)
  const { sessionId } = ctx.params as any
  const { clueNumber, direction, cachedOnly } = (ctx.body as any) || {}

  if (!clueNumber || !direction) {
    throw new HttpError(400, { error: 'Missing clueNumber or direction' })
  }

  const requestId = crypto.randomUUID()

  try {
    const session = await SessionService.getSessionWithPuzzle(sessionId)
    if (!session) {
      throw new HttpError(444, { error: 'Session not found' })
    }

    const { ExplanationService } = await import('../services/explanationService')
    const cached = await ExplanationService.getCachedExplanation(session.id, clueNumber, direction)

    if (cached) {
      return jsonResponse({ success: true, explanation: cached, cached: true })
    }

    if (cachedOnly) {
      throw new HttpError(404, {
        success: false,
        cached: false,
        message: 'Explanation not cached yet',
      })
    }

    if (!user) {
      throw new HttpError(401, {
        error: 'Authentication required to generate new explanations',
        cached: false,
      })
    }

    // Return 202 immediately and process in background
    const response = new Response(
      JSON.stringify({
        success: true,
        processing: true,
        requestId,
        message: 'Explanation is being generated...',
      }),
      {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      },
    )

    // Background processing
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

        // Emit via WebSocket
        const { bunServer } = await import('../bin/server')
        bunServer.publish(sessionId, JSON.stringify({
          type: 'explanation_ready',
          requestId,
          clueNumber,
          direction,
          explanation,
          success: true,
        }))
      } catch (error) {
        console.error('Background explanation error:', error)
        try {
          const { bunServer } = await import('../bin/server')
          bunServer.publish(sessionId, JSON.stringify({
            type: 'explanation_ready',
            requestId,
            clueNumber,
            direction,
            success: false,
            error: 'Failed to generate explanation',
          }))
        } catch (e) {
          console.error('Failed to emit error socket event:', e)
        }
      }
    })

    return response
  } catch (error: any) {
    if (error instanceof HttpError) throw error
    console.error('Error providing explanation:', error)
    throw new HttpError(500, { error: 'Failed to provide explanation' })
  }
}

// Report a bad explanation
async function handleReportExplanation(ctx: Context) {
  const user = optionalAuthenticateUser(ctx)
  const { sessionId } = ctx.params as any
  const { clueNumber, direction, feedback } = (ctx.body as any) || {}

  if (!clueNumber || !direction) {
    throw new HttpError(400, { error: 'Missing clueNumber or direction' })
  }

  try {
    const session = await SessionService.getSessionWithPuzzle(sessionId)
    if (!session) {
      throw new HttpError(444, { error: 'Session not found' })
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

    return jsonResponse({ success: true, message: 'Report submitted successfully' })
  } catch (error: any) {
    if (error instanceof HttpError) throw error
    console.error('Error reporting explanation:', error)
    throw new HttpError(500, { error: 'Failed to submit report' })
  }
}

// Claim a word (HTTP fallback for socket)
async function handleClaimWord(ctx: Context) {
  const { sessionId } = ctx.params as any
  const body = ctx.body as any
  const { clueKey, userId, username } = body || {}

  if (!sessionId || !clueKey || !username) {
    throw new HttpError(400, { error: 'Missing sessionId, clueKey, or username' })
  }

  try {
    const claimed = await SessionService.recordWordAttribution(sessionId, clueKey, userId || null, username)

    if (claimed) {
      const { bunServer } = await import('../bin/server')
      const timestamp = new Date().toISOString()
      bunServer.publish(sessionId, JSON.stringify({
        type: 'word_claimed',
        clueKey,
        userId: userId || null,
        username,
        timestamp,
      }))
    }

    return jsonResponse({ success: true, claimed })
  } catch (error: any) {
    if (error instanceof HttpError) throw error
    console.error('Error claiming word via HTTP:', error)
    throw new HttpError(500, { error: 'Failed to claim word' })
  }
}
