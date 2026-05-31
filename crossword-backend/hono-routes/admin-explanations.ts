import crypto from 'crypto'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { requireAdmin, type AuthUser } from '../hono-middleware/auth'
import db from '../db-knex'
import { regenerateCrypticClueExplanation } from '../utils/openrouter'
import { OPENROUTER_MODELS } from '../config'
import OpenAI from 'openai'

type Variables = { user: AuthUser | null }

const adminExplanations = new Hono<{ Variables: Variables }>()

// GET /api/admin/explanations/models
adminExplanations.get('/models', (c) => {
  requireAdmin(c)
  return c.json(Object.keys(OPENROUTER_MODELS))
})

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
  const { clue, answer, feedback, previousExplanation, modelKey } = body

  if (!clue || !answer) {
    throw new HTTPException(400, { message: 'Missing clue or answer' })
  }

  const modelSlug = modelKey ? (OPENROUTER_MODELS[modelKey as keyof typeof OPENROUTER_MODELS] ?? undefined) : undefined

  const requestId = crypto.randomUUID()
  console.log(`[Regenerate] Request received. RequestID: ${requestId}, model: ${modelSlug ?? 'default'}`)

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
        model: modelSlug,
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

// ==========================================
// BATCH EXPLANATION ROUTES
// ==========================================

// GET /api/admin/explanations/batches/puzzles
adminExplanations.get('/batches/puzzles', async (c) => {
  requireAdmin(c)
  try {
    const puzzles = await db('puzzles')
      .select('id', 'title', 'book', 'puzzle_number', 'clues')
      .orderBy('id', 'desc')

    const result = []
    for (const p of puzzles) {
      const cluesObj = JSON.parse(p.clues)
      const totalClues = (cluesObj.across?.length || 0) + (cluesObj.down?.length || 0)

      const explainedCount = await db('clue_explanations')
        .where('puzzle_id', p.id)
        .count('* as count')
        .first()

      const explained = (explainedCount as any)?.count || 0

      // Check if there is an active/pending batch for this puzzle
      const activeBatch = await db('explanation_batches')
        .where({ puzzle_id: p.id })
        .whereNull('applied_at')
        .orderBy('created_at', 'desc')
        .first()

      result.push({
        id: p.id,
        title: p.title,
        book: p.book,
        puzzle_number: p.puzzle_number,
        total_clues: totalClues,
        explained_clues: explained,
        remaining: totalClues - explained,
        active_batch: activeBatch ? {
          batch_id: activeBatch.batch_id,
          status: activeBatch.status,
          created_at: activeBatch.created_at,
        } : null
      })
    }
    return c.json(result)
  } catch (error) {
    console.error('Error fetching puzzles batches status:', error)
    throw new HTTPException(500, { message: 'Failed to fetch puzzles status' })
  }
})

// GET /api/admin/explanations/batches/history
adminExplanations.get('/batches/history', async (c) => {
  requireAdmin(c)
  try {
    const batches = await db('explanation_batches')
      .join('puzzles', 'explanation_batches.puzzle_id', 'puzzles.id')
      .select(
        'explanation_batches.*',
        'puzzles.title as puzzle_title',
        'puzzles.puzzle_number'
      )
      .orderBy('explanation_batches.created_at', 'desc')
      .limit(50)

    return c.json(batches)
  } catch (error) {
    console.error('Error fetching batch history:', error)
    throw new HTTPException(500, { message: 'Failed to fetch batch history' })
  }
})

// POST /api/admin/explanations/batches/create
adminExplanations.post('/batches/create', async (c) => {
  requireAdmin(c)
  const { puzzleId, force } = await c.req.json().catch(() => ({}))

  if (!puzzleId) {
    throw new HTTPException(400, { message: 'Missing puzzleId' })
  }

  try {
    const puzzle = await db('puzzles').where('id', puzzleId).first()
    if (!puzzle) {
      throw new HTTPException(404, { message: 'Puzzle not found' })
    }

    const clues = JSON.parse(puzzle.clues)
    const encrypted = JSON.parse(puzzle.answers_encrypted || '{}')
    
    const rot13 = (str: string): string => {
      return str.replace(/[a-zA-Z]/g, (c) => {
        const base = c <= 'Z' ? 65 : 97
        return String.fromCharCode(base + ((c.charCodeAt(0) - base + 13) % 26))
      })
    }

    const decryptList = (list: any[]) => (list || []).map((a) => ({ ...a, answer: rot13(a.answer) }))
    const answersAcross = decryptList(encrypted.across)
    const answersDown = decryptList(encrypted.down)

    const requests = []

    // Across clues
    for (const clue of clues.across || []) {
      const existing = await db('clue_explanations')
        .where({ puzzle_id: puzzle.id, clue_number: clue.number, direction: 'across' })
        .first()

      if (existing && !force) continue
      if (existing && force) {
        try {
          const parsed = JSON.parse(existing.explanation_json)
          const steps = parsed?.wordplay_steps ?? parsed?.explanation?.wordplay_steps
          if (Array.isArray(steps?.[0]?.tokens)) continue
        } catch {}
      }

      const answerObj = answersAcross.find((a) => a.number === clue.number)
      if (!answerObj) continue

      const { buildExplanationRequestBody } = await import('../utils/openai')
      requests.push({
        custom_id: `p${puzzle.id}_c${clue.number}_across`,
        method: 'POST',
        url: '/v1/responses',
        body: buildExplanationRequestBody(clue.clue, answerObj.answer),
      })
    }

    // Down clues
    for (const clue of clues.down || []) {
      const existing = await db('clue_explanations')
        .where({ puzzle_id: puzzle.id, clue_number: clue.number, direction: 'down' })
        .first()

      if (existing && !force) continue
      if (existing && force) {
        try {
          const parsed = JSON.parse(existing.explanation_json)
          const steps = parsed?.wordplay_steps ?? parsed?.explanation?.wordplay_steps
          if (Array.isArray(steps?.[0]?.tokens)) continue
        } catch {}
      }

      const answerObj = answersDown.find((a) => a.number === clue.number)
      if (!answerObj) continue

      const { buildExplanationRequestBody } = await import('../utils/openai')
      requests.push({
        custom_id: `p${puzzle.id}_c${clue.number}_down`,
        method: 'POST',
        url: '/v1/responses',
        body: buildExplanationRequestBody(clue.clue, answerObj.answer),
      })
    }

    if (requests.length === 0) {
      return c.json({ success: true, message: 'No new clues to explain.', batchId: null })
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

    const jsonlContent = requests.map((r) => JSON.stringify(r)).join('\n')
    const blobOrFile = new Blob([jsonlContent], { type: 'application/jsonl' }) as any

    const file = await openai.files.create({
      file: blobOrFile,
      purpose: 'batch',
    })

    const batch = await openai.batches.create({
      input_file_id: file.id,
      endpoint: '/v1/responses',
      completion_window: '24h',
    })

    await db('explanation_batches').insert({
      batch_id: batch.id,
      puzzle_id: puzzle.id,
      status: 'pending',
      input_file_id: file.id,
    })

    return c.json({
      success: true,
      message: `Successfully created batch job with ${requests.length} requests.`,
      batchId: batch.id,
      requestCount: requests.length,
    })
  } catch (error: any) {
    console.error('Error creating batch job:', error)
    throw new HTTPException(500, { message: error.message || 'Failed to create batch job' })
  }
})

// POST /api/admin/explanations/batches/status/:batchId
adminExplanations.post('/batches/status/:batchId', async (c) => {
  requireAdmin(c)
  const batchId = c.req.param('batchId')

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const batchStatus = await openai.batches.retrieve(batchId)

    await db('explanation_batches')
      .where('batch_id', batchId)
      .update({
        status: batchStatus.status,
        output_file_id: batchStatus.output_file_id || null,
        updated_at: db.fn.now(),
      })

    return c.json({
      batch_id: batchId,
      status: batchStatus.status,
      output_file_id: batchStatus.output_file_id || null,
    })
  } catch (error: any) {
    console.error('Error checking batch status:', error)
    throw new HTTPException(500, { message: error.message || 'Failed to retrieve batch status' })
  }
})

// POST /api/admin/explanations/batches/apply/:batchId
adminExplanations.post('/batches/apply/:batchId', async (c) => {
  requireAdmin(c)
  const batchId = c.req.param('batchId')

  try {
    const batchRecord = await db('explanation_batches').where('batch_id', batchId).first()
    if (!batchRecord) {
      throw new HTTPException(404, { message: 'Batch not found in database' })
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const batch = await openai.batches.retrieve(batchId)

    if (batch.status !== 'completed') {
      return c.json({ success: false, message: `Batch status is ${batch.status}, not completed.` })
    }

    if (!batch.output_file_id) {
      throw new HTTPException(400, { message: 'No output file ID found' })
    }

    const fileResponse = await openai.files.content(batch.output_file_id)
    const fileContents = await fileResponse.text()

    const results = fileContents
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))

    let successCount = 0
    let failCount = 0
    let validationFailCount = 0

    const he = await import('he')
    const decodeEntities = (value: unknown): unknown => {
      if (typeof value === 'string') return he.decode(value)
      if (Array.isArray(value)) return value.map(decodeEntities)
      if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, decodeEntities(v)]))
      }
      return value
    }

    const rot13 = (str: string): string => {
      return str.replace(/[a-zA-Z]/g, (c) => {
        const base = c <= 'Z' ? 65 : 97
        return String.fromCharCode(base + ((c.charCodeAt(0) - base + 13) % 26))
      })
    }

    const { ExplanationSchema } = await import('../utils/crypticSchema')
    const { ExplanationService } = await import('../services/explanationService')

    for (const result of results) {
      try {
        const customId = result.custom_id
        const [pPart, cPart, dir] = customId.split('_')
        const puzzleId = parseInt(pPart.substring(1))
        const clueNumber = parseInt(cPart.substring(1))
        const direction = dir

        if (result.response.status_code !== 200) {
          failCount++
          continue
        }

        let content: string | undefined
        const body = result.response.body

        if (body.output && Array.isArray(body.output)) {
          const messageOutput = body.output.find((o: any) => o.type === 'message')
          if (messageOutput && messageOutput.content && Array.isArray(messageOutput.content)) {
            const textOutput = messageOutput.content.find((c: any) => c.type === 'output_text')
            if (textOutput && textOutput.text) {
              content = textOutput.text
            }
          }
        }

        if (!content && body.choices?.[0]?.message?.content) {
          content = body.choices[0].message.content
        }

        if (!content) {
          failCount++
          continue
        }

        let parsed = JSON.parse(content)
        parsed = decodeEntities(parsed)

        let explanation: any
        if (parsed.explanation && typeof parsed.explanation === 'object') {
          explanation = parsed.explanation
        } else if (parsed.clue_type) {
          explanation = parsed
        } else {
          failCount++
          continue
        }

        const validationResult = ExplanationSchema.safeParse(explanation)
        if (!validationResult.success) {
          validationFailCount++
          continue
        }

        const puzzle = await db('puzzles').where('id', puzzleId).first()
        if (!puzzle) continue

        const clues = JSON.parse(puzzle.clues)
        const encrypted = JSON.parse(puzzle.answers_encrypted || '{}')

        const clueList = direction === 'across' ? clues.across : clues.down
        const answerList = direction === 'across' ? encrypted.across : encrypted.down

        const clueObj = clueList.find((c: any) => c.number === clueNumber)
        const answerObj = (answerList as any[])?.find((a) => a.number === clueNumber)

        if (!clueObj || !answerObj) continue

        const decryptedAnswer = rot13(answerObj.answer)

        await ExplanationService.saveExplanation(
          puzzleId,
          clueNumber,
          direction,
          clueObj.clue,
          decryptedAnswer,
          explanation,
        )

        successCount++
      } catch (err) {
        console.error(`Error processing result inside API:`, err)
        failCount++
      }
    }

    if (successCount > 0) {
      await db('explanation_batches')
        .where('batch_id', batchId)
        .update({
          status: batch.status,
          output_file_id: batch.output_file_id,
          applied_at: db.fn.now(),
          updated_at: db.fn.now(),
        })
    }

    return c.json({
      success: true,
      saved: successCount,
      failed: failCount,
      validation_failed: validationFailCount,
    })
  } catch (error: any) {
    console.error('Error applying batch results:', error)
    throw new HTTPException(500, { message: error.message || 'Failed to apply batch results' })
  }
})

export { adminExplanations }
