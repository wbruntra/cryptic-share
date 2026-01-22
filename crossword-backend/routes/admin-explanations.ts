import { Router } from 'express'
import crypto from 'crypto'
import db from '../db-knex'
import { regenerateCrypticClueExplanation } from '../utils/openai'
import { ExplanationService } from '../services/explanationService'

const router = Router()

// GET /api/admin/explanations/:puzzleId
// Fetch all explanations for a specific puzzle, including any user reports
router.get('/explanations/:puzzleId', async (req, res) => {
  const { puzzleId } = req.params

  try {
    // Fetch all clues for the puzzle with their current explanations and report counts
    const explanations = await db('clue_explanations')
      .where('clue_explanations.puzzle_id', puzzleId)
      .select(
        'clue_explanations.*',
        db.raw(
          '(SELECT COUNT(*) FROM explanation_reports WHERE explanation_reports.puzzle_id = clue_explanations.puzzle_id AND explanation_reports.clue_number = clue_explanations.clue_number AND explanation_reports.direction = clue_explanations.direction AND explanation_reports.explanation_updated = 0) as pending_reports',
        ),
      )
      .orderBy(['clue_number', 'direction'])

    res.json(explanations)
  } catch (error) {
    console.error('Error fetching explanations:', error)
    res.status(500).json({ error: 'Failed to fetch explanations' })
  }
})

// GET /api/admin/reports
// Fetch all pending reports
router.get('/reports', async (req, res) => {
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

    res.json(reports)
  } catch (error) {
    console.error('Error fetching reports:', error)
    res.status(500).json({ error: 'Failed to fetch reports' })
  }
})

// GET /api/admin/explanations/regenerate/:requestId
// Check regeneration status (for polling fallback)
router.get('/explanations/regenerate/:requestId', async (req, res) => {
  const { requestId } = req.params

  try {
    const record = await db('explanation_regenerations')
      .where({ request_id: requestId })
      .first()

    if (!record) {
      return res.status(404).json({ error: 'Request not found' })
    }

    if (record.status === 'success' && record.explanation_json) {
      return res.json({
        requestId,
        status: 'success',
        explanation: JSON.parse(record.explanation_json),
      })
    }

    if (record.status === 'error') {
      return res.json({
        requestId,
        status: 'error',
        error: record.error_message || 'Failed to regenerate explanation',
      })
    }

    return res.json({
      requestId,
      status: 'pending',
      message: 'Regeneration in progress...',
    })
  } catch (error) {
    console.error('Error checking regeneration status:', error)
    res.status(500).json({ error: 'Failed to check regeneration status' })
  }
})

// POST /api/admin/explanations/regenerate
// Trigger regeneration of an explanation (async via socket)
router.post('/explanations/regenerate', async (req, res) => {
  const { clue, answer, feedback, previousExplanation, socketId } = req.body

  if (!clue || !answer) {
    return res.status(400).json({ error: 'Missing clue or answer' })
  }

  // Generate a unique requestId for this operation
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

  // If socketId is provided, process async with requestId
  if (socketId) {
    // Return immediately
    res.status(202).json({
      processing: true,
      message: 'Regeneration started...',
      requestId,
    })

    // Process in background using setImmediate to ensure response is sent first
    setImmediate(async () => {
      try {
        const { io } = await import('../app') // Import dynamically to avoid circular dependency

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
        io.to(socketId).emit('admin_explanation_ready', {
          success: true,
          explanation: newExplanation,
          clue,
          answer,
          requestId, // Include requestId so frontend can match it
        })
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
        const { io } = await import('../app')
        io.to(socketId).emit('admin_explanation_ready', {
          success: false,
          error: 'Failed to regenerate explanation',
          requestId,
        })
      }
    })
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

      res.json(newExplanation)
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

      res.status(500).json({ error: 'Failed to regenerate explanation' })
    }
  }
})

// POST /api/admin/explanations/save
// Save an explanation and resolve pertinent reports
router.post('/explanations/save', async (req, res) => {
  const { puzzleId, clueNumber, direction, clueText, answer, explanation } = req.body

  if (!puzzleId || !clueNumber || !direction || !explanation) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  try {
    // Extract the inner explanation to avoid nested structure if present
    const explanationToSave = explanation.explanation || explanation

    // Save directly to db to bypass basic validation if needed, or use service
    // We'll use direct DB insert similar to the script fix for consistency
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

    // Mark pending reports as resolved
    const updatedCount = await db('explanation_reports')
      .where({
        puzzle_id: puzzleId,
        clue_number: clueNumber,
        direction: direction,
        explanation_updated: 0,
      })
      .update({ explanation_updated: 1 })

    res.json({ success: true, resolvedReports: updatedCount })
  } catch (error) {
    console.error('Error saving explanation:', error)
    res.status(500).json({ error: 'Failed to save explanation' })
  }
})

// POST /api/admin/reports
// File a manual report
router.post('/reports', async (req, res) => {
  const { puzzleId, clueNumber, direction, feedback } = req.body

  if (!puzzleId || !clueNumber || !direction || !feedback) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  try {
    await db('explanation_reports').insert({
      puzzle_id: puzzleId,
      clue_number: clueNumber,
      direction: direction,
      feedback: feedback,
      explanation_updated: 0,
    })

    res.json({ success: true })
  } catch (error) {
    console.error('Error creating report:', error)
    res.status(500).json({ error: 'Failed to create report' })
  }
})

export default router
