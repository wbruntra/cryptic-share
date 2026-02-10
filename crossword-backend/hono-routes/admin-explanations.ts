import crypto from 'crypto'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { requireAdmin, type AuthUser } from '../hono-middleware/auth'
import db from '../db-knex'
import { regenerateCrypticClueExplanation } from '../utils/openai'

type Variables = { user: AuthUser | null }

const adminExplanations = new Hono<{ Variables: Variables }>()

// GET /api/admin/explanations/:puzzleId
adminExplanations.get('/:puzzleId', async (c) => {
  requireAdmin(c)
  const puzzleId = c.req.param('puzzleId')

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

    return c.json(explanations)
  } catch (error) {
    console.error('Error fetching explanations:', error)
    throw new HTTPException(500, { message: 'Failed to fetch explanations' })
  }
})

// GET /api/admin/reports
adminExplanations.get('/reports', async (c) => {
  requireAdmin(c)

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

    return c.json(reports)
  } catch (error) {
    console.error('Error fetching reports:', error)
    throw new HTTPException(500, { message: 'Failed to fetch reports' })
  }
})

// GET /api/admin/explanations/regenerate/:requestId - Check status
adminExplanations.get('/regenerate/:requestId', async (c) => {
  const requestId = c.req.param('requestId')

  try {
    const record = await db('explanation_regenerations').where({ request_id: requestId }).first()

    if (!record) {
      throw new HTTPException(404, { message: 'Request not found' })
    }

    if (record.status === 'success' && record.explanation_json) {
      return c.json({
        requestId,
        status: 'success',
        explanation: JSON.parse(record.explanation_json),
      })
    }

    if (record.status === 'error') {
      return c.json({
        requestId,
        status: 'error',
        error: record.error_message || 'Failed to regenerate explanation',
      })
    }

    return c.json({
      requestId,
      status: 'pending',
      message: 'Regeneration in progress...',
    })
  } catch (error: any) {
    if (error instanceof HTTPException) throw error
    console.error('Error checking regeneration status:', error)
    throw new HTTPException(500, { message: 'Failed to check regeneration status' })
  }
})

// POST /api/admin/explanations/regenerate
adminExplanations.post('/regenerate', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const { clue, answer, feedback, previousExplanation } = body

  if (!clue || !answer) {
    throw new HTTPException(400, { message: 'Missing clue or answer' })
  }

  const requestId = crypto.randomUUID()
  console.log(`[Regenerate] Request received. RequestID: ${requestId}`)

  try {
    await db('explanation_regenerations').insert({
      request_id: requestId,
      clue_text: clue,
      answer,
      feedback: feedback || null,
      previous_explanation_json: previousExplanation ? JSON.stringify(previousExplanation) : null,
      status: 'pending',
    })
  } catch (error) {
    console.error('Error recording regeneration request:', error)
  }

  // Process in background
  setImmediate(async () => {
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
        console.error('Error updating regeneration record (success):', updateError)
      }

      console.log(`[Regenerate] Completed ${requestId}`)
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
    }
  })

  return c.json(
    {
      processing: true,
      message: 'Regeneration started...',
      requestId,
    },
    202,
  )
})

// POST /api/admin/explanations/save
adminExplanations.post('/save', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const { puzzleId, clueNumber, direction, clueText, answer, explanation } = body

  if (!puzzleId || !clueNumber || !direction || !explanation) {
    throw new HTTPException(400, { message: 'Missing required fields' })
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

    return c.json({ success: true, resolvedReports: updatedCount })
  } catch (error) {
    console.error('Error saving explanation:', error)
    throw new HTTPException(500, { message: 'Failed to save explanation' })
  }
})

// POST /api/admin/reports
adminExplanations.post('/reports', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const { puzzleId, clueNumber, direction, feedback } = body

  if (!puzzleId || !clueNumber || !direction || !feedback) {
    throw new HTTPException(400, { message: 'Missing required fields' })
  }

  try {
    await db('explanation_reports').insert({
      puzzle_id: puzzleId,
      clue_number: clueNumber,
      direction: direction,
      feedback: feedback,
      explanation_updated: 0,
    })

    return c.json({ success: true })
  } catch (error) {
    console.error('Error creating report:', error)
    throw new HTTPException(500, { message: 'Failed to create report' })
  }
})

export { adminExplanations }
