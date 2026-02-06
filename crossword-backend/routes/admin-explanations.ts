import crypto from 'crypto'
import { Router, jsonResponse, HttpError, type Context } from '../http/router'
import { requireAdmin } from '../middleware/auth'
import db from '../db-knex'
import { regenerateCrypticClueExplanation } from '../utils/openai'
import { ExplanationService } from '../services/explanationService'

export function registerAdminExplanationRoutes(router: Router) {
  router.get('/api/admin/explanations/:puzzleId', handleGetExplanations)
  router.get('/api/admin/reports', handleGetReports)
  router.get('/api/admin/explanations/regenerate/:requestId', handleCheckRegenerationStatus)
  router.post('/api/admin/explanations/regenerate', handleRegenerateExplanation)
  router.post('/api/admin/explanations/save', handleSaveExplanation)
  router.post('/api/admin/reports', handleCreateReport)
}

// GET /api/admin/explanations/:puzzleId
// Fetch all explanations for a specific puzzle, including any user reports
async function handleGetExplanations(ctx: Context) {
  requireAdmin(ctx)
  const { puzzleId } = ctx.params as any

  try {
    const explanations = await db('clue_explanations')
      .where('clue_explanations.puzzle_id', puzzleId)
      .select(
        'clue_explanations.*',
        db.raw(
          '(SELECT COUNT(*) FROM explanation_reports WHERE explanation_reports.puzzle_id = clue_explanations.puzzle_id AND explanation_reports.clue_number = clue_explanations.clue_number AND explanation_reports.direction = clue_explanations.direction AND explanation_reports.explanation_updated = 0) as pending_reports',
        ),
      )
      .orderBy(['clue_number', 'direction'])

    return jsonResponse(explanations)
  } catch (error) {
    console.error('Error fetching explanations:', error)
    throw new HttpError(500, { error: 'Failed to fetch explanations' })
  }
}

// GET /api/admin/reports
// Fetch all pending reports
async function handleGetReports(ctx: Context) {
  requireAdmin(ctx)

  try {
    const reports = await db('explanation_reports')
      .join('clue_explanations', function () {
        this.on('explanation_reports.puzzle_id', '=', 'clue_explanations.puzzle_id')
          .andOn('explanation_reports.clue_number', '=', 'clue_explanations.clue_number')
          .andOn('explanation_reports.direction', '=', 'clue_explanations.direction')
      })
      .where('explanation_reports.explanation_updated', 0)
      .select('explanation_reports.*', 'clue_explanations.answer', 'clue_explanations.clue_text')
      .orderBy('explanation_reports.reported_at', 'desc')

    return jsonResponse(reports)
  } catch (error) {
    console.error('Error fetching reports:', error)
    throw new HttpError(500, { error: 'Failed to fetch reports' })
  }
}

// GET /api/admin/explanations/regenerate/:requestId
// Check regeneration status (for polling fallback)
async function handleCheckRegenerationStatus(ctx: Context) {
  const { requestId } = ctx.params as any

  try {
    const record = await db('explanation_regenerations')
      .where({ request_id: requestId })
      .first()

    if (!record) {
      throw new HttpError(404, { error: 'Request not found' })
    }

    if (record.status === 'success' && record.explanation_json) {
      return jsonResponse({
        requestId,
        status: 'success',
        explanation: JSON.parse(record.explanation_json),
      })
    }

    if (record.status === 'error') {
      return jsonResponse({
        requestId,
        status: 'error',
        error: record.error_message || 'Failed to regenerate explanation',
      })
    }

    return jsonResponse({
      requestId,
      status: 'pending',
      message: 'Regeneration in progress...',
    })
  } catch (error: any) {
    if (error instanceof HttpError) throw error
    console.error('Error checking regeneration status:', error)
    throw new HttpError(500, { error: 'Failed to check regeneration status' })
  }
}

// POST /api/admin/explanations/regenerate
// Trigger regeneration of an explanation (async via WebSocket)
async function handleRegenerateExplanation(ctx: Context) {
  const body = ctx.body as any
  const { clue, answer, feedback, previousExplanation, socketId } = body || {}

  if (!clue || !answer) {
    throw new HttpError(400, { error: 'Missing clue or answer' })
  }

  const requestId = crypto.randomUUID()
  console.log(
    `[Regenerate] Request received. SocketID: ${socketId || 'NONE'}. RequestID: ${requestId}`,
  )

  try {
    await db('explanation_regenerations').insert({
      request_id: requestId,
      clue_text: clue,
      answer,
      feedback: feedback || null,
      previous_explanation_json: previousExplanation
        ? JSON.stringify(previousExplanation)
        : null,
      status: 'pending',
    })
  } catch (error) {
    console.error('Error recording regeneration request:', error)
  }

  if (socketId) {
    // Return immediately with 202 Accepted
    const response = new Response(
      JSON.stringify({
        processing: true,
        message: 'Regeneration started...',
        requestId,
      }),
      {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      },
    )

    // Process in background
    setImmediate(async () => {
      try {
        const { bunServer } = await import('../bin/server')

        const newExplanation = await regenerateCrypticClueExplanation({
          clue,
          answer,
          feedback: feedback || 'Admin requested regeneration',
          previousExplanation,
        })

        try {
          await db('explanation_regenerations')
            .where({ request_id: requestId })
            .update({
              status: 'success',
              explanation_json: JSON.stringify(newExplanation),
              updated_at: db.fn.now(),
            })
        } catch (updateError) {
          console.error('Error updating regeneration record (success):', updateError)
        }

        console.log(`[Regenerate] Completed ${requestId}. Emitting to ${socketId}`)
        bunServer.publish(socketId, JSON.stringify({
          type: 'admin_explanation_ready',
          success: true,
          explanation: newExplanation,
          clue,
          answer,
          requestId,
        }))
      } catch (error) {
        console.error('Error in async regeneration:', error)
        try {
          await db('explanation_regenerations')
            .where({ request_id: requestId })
            .update({
              status: 'error',
              error_message: (error as Error)?.message || 'Failed to regenerate explanation',
              updated_at: db.fn.now(),
            })
        } catch (updateError) {
          console.error('Error updating regeneration record (error):', updateError)
        }
        const { bunServer } = await import('../bin/server')
        bunServer.publish(socketId, JSON.stringify({
          type: 'admin_explanation_ready',
          success: false,
          error: 'Failed to regenerate explanation',
          requestId,
        }))
      }
    })

    return response
  } else {
    // Fallback to sync for scripts/legacy
    try {
      const newExplanation = await regenerateCrypticClueExplanation({
        clue,
        answer,
        feedback: feedback || 'Admin requested regeneration',
        previousExplanation,
      })

      try {
        await db('explanation_regenerations')
          .where({ request_id: requestId })
          .update({
            status: 'success',
            explanation_json: JSON.stringify(newExplanation),
            updated_at: db.fn.now(),
          })
      } catch (updateError) {
        console.error('Error updating regeneration record (sync success):', updateError)
      }

      return jsonResponse(newExplanation)
    } catch (error) {
      console.error('Error regenerating explanation:', error)

      try {
        await db('explanation_regenerations')
          .where({ request_id: requestId })
          .update({
            status: 'error',
            error_message: (error as Error)?.message || 'Failed to regenerate explanation',
            updated_at: db.fn.now(),
          })
      } catch (updateError) {
        console.error('Error updating regeneration record (sync error):', updateError)
      }

      throw new HttpError(500, { error: 'Failed to regenerate explanation' })
    }
  }
}

// POST /api/admin/explanations/save
// Save an explanation and resolve pertinent reports
async function handleSaveExplanation(ctx: Context) {
  const body = ctx.body as any
  const { puzzleId, clueNumber, direction, clueText, answer, explanation } = body || {}

  if (!puzzleId || !clueNumber || !direction || !explanation) {
    throw new HttpError(400, { error: 'Missing required fields' })
  }

  try {
    const explanationToSave = explanation.explanation || explanation

    await db('clue_explanations')
      .insert({
        puzzle_id: puzzleId,
        clue_number: clueNumber,
        direction: direction,
        clue_text: clueText,
        answer: answer,
        explanation_json: JSON.stringify(explanationToSave),
      })
      .onConflict(['puzzle_id', 'clue_number', 'direction'])
      .merge()

    const updatedCount = await db('explanation_reports')
      .where({
        puzzle_id: puzzleId,
        clue_number: clueNumber,
        direction: direction,
        explanation_updated: 0,
      })
      .update({ explanation_updated: 1 })

    return jsonResponse({ success: true, resolvedReports: updatedCount })
  } catch (error) {
    console.error('Error saving explanation:', error)
    throw new HttpError(500, { error: 'Failed to save explanation' })
  }
}

// POST /api/admin/reports
// File a manual report
async function handleCreateReport(ctx: Context) {
  const body = ctx.body as any
  const { puzzleId, clueNumber, direction, feedback } = body || {}

  if (!puzzleId || !clueNumber || !direction || !feedback) {
    throw new HttpError(400, { error: 'Missing required fields' })
  }

  try {
    await db('explanation_reports').insert({
      puzzle_id: puzzleId,
      clue_number: clueNumber,
      direction: direction,
      feedback: feedback,
      explanation_updated: 0,
    })

    return jsonResponse({ success: true })
  } catch (error) {
    console.error('Error creating report:', error)
    throw new HttpError(500, { error: 'Failed to create report' })
  }
}
