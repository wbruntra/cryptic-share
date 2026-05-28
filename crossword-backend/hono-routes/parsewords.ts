import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { requireAdmin, type AuthUser } from '../hono-middleware/auth'
import db from '../db-knex'
import { generateParsewordsPuzzle, models as OPENROUTER_MODELS } from '../utils/parsewordsGenerator'

type Variables = { user: AuthUser | null }

const parsewords = new Hono<{ Variables: Variables }>()

function shuffleArray<T>(arr: T[]): T[] {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = out[i]!
    out[i] = out[j]!
    out[j] = tmp
  }
  return out
}

function shufflePuzzleTriggers(puzzle: Record<string, unknown>): Record<string, unknown> {
  const triggers = puzzle.triggers as Array<{ action: Record<string, unknown> }> | undefined
  if (!triggers) return puzzle
  return {
    ...puzzle,
    triggers: triggers.map((trigger) => {
      const action = trigger.action
      if ((action.kind === 'replace' || action.kind === 'result') && Array.isArray(action.options)) {
        return { ...trigger, action: { ...action, options: shuffleArray(action.options as string[]) } }
      }
      return trigger
    }),
  }
}

// GET /api/parsewords
// Returns all saved parsewords puzzles (public — used by the game)
parsewords.get('/', async (c) => {
  const rows = await db('parsewords_puzzles')
    .select(
      'parsewords_puzzles.id',
      'parsewords_puzzles.puzzle_id',
      'parsewords_puzzles.clue_number',
      'parsewords_puzzles.direction',
      'parsewords_puzzles.puzzle_json',
      'parsewords_puzzles.updated_at',
      'clue_explanations.clue_text',
      'clue_explanations.answer',
    )
    .leftJoin('clue_explanations', function () {
      this.on('clue_explanations.puzzle_id', 'parsewords_puzzles.puzzle_id')
        .andOn('clue_explanations.clue_number', 'parsewords_puzzles.clue_number')
        .andOn('clue_explanations.direction', 'parsewords_puzzles.direction')
    })
    .orderBy(['parsewords_puzzles.puzzle_id', 'parsewords_puzzles.clue_number'])

  return c.json(rows.map((row) => ({
    id: row.id,
    puzzleId: row.puzzle_id,
    clueNumber: row.clue_number,
    direction: row.direction,
    clueText: row.clue_text,
    answer: row.answer,
    updatedAt: row.updated_at,
    puzzle: shufflePuzzleTriggers(JSON.parse(row.puzzle_json)),
  })))
})

// GET /api/parsewords/puzzle/:puzzleId
// Returns all saved parsewords puzzles for a specific puzzle (public)
parsewords.get('/puzzle/:puzzleId', async (c) => {
  const puzzleId = c.req.param('puzzleId')

  const rows = await db('parsewords_puzzles')
    .where('parsewords_puzzles.puzzle_id', puzzleId)
    .select(
      'parsewords_puzzles.id',
      'parsewords_puzzles.clue_number',
      'parsewords_puzzles.direction',
      'parsewords_puzzles.puzzle_json',
      'parsewords_puzzles.updated_at',
      'clue_explanations.clue_text',
      'clue_explanations.answer',
    )
    .leftJoin('clue_explanations', function () {
      this.on('clue_explanations.puzzle_id', 'parsewords_puzzles.puzzle_id')
        .andOn('clue_explanations.clue_number', 'parsewords_puzzles.clue_number')
        .andOn('clue_explanations.direction', 'parsewords_puzzles.direction')
    })
    .orderBy(['parsewords_puzzles.clue_number', 'parsewords_puzzles.direction'])

  return c.json(rows.map((row) => ({
    id: row.id,
    clueNumber: row.clue_number,
    direction: row.direction,
    clueText: row.clue_text,
    answer: row.answer,
    updatedAt: row.updated_at,
    puzzle: shufflePuzzleTriggers(JSON.parse(row.puzzle_json)),
  })))
})

// GET /api/parsewords/admin/clues/:puzzleId
// Returns all clues that have explanations for a puzzle, with parsewords status
parsewords.get('/admin/clues/:puzzleId', async (c) => {
  requireAdmin(c)
  const puzzleId = c.req.param('puzzleId')

  const rows = await db('clue_explanations')
    .where('clue_explanations.puzzle_id', puzzleId)
    .select(
      'clue_explanations.id as explanation_id',
      'clue_explanations.clue_number',
      'clue_explanations.direction',
      'clue_explanations.clue_text',
      'clue_explanations.answer',
      'clue_explanations.explanation_json',
      'parsewords_puzzles.id as parsewords_id',
      'parsewords_puzzles.puzzle_json',
      'parsewords_puzzles.updated_at as parsewords_updated_at',
    )
    .leftJoin('parsewords_puzzles', function () {
      this.on('parsewords_puzzles.puzzle_id', 'clue_explanations.puzzle_id')
        .andOn('parsewords_puzzles.clue_number', 'clue_explanations.clue_number')
        .andOn('parsewords_puzzles.direction', 'clue_explanations.direction')
    })
    .orderBy(['clue_explanations.clue_number', 'clue_explanations.direction'])

  return c.json(rows.map((row) => ({
    explanationId: row.explanation_id,
    clueNumber: row.clue_number,
    direction: row.direction,
    clueText: row.clue_text,
    answer: row.answer,
    explanation: JSON.parse(row.explanation_json),
    parsewordsId: row.parsewords_id ?? null,
    puzzle: row.puzzle_json ? JSON.parse(row.puzzle_json) : null,
    parsewordsUpdatedAt: row.parsewords_updated_at ?? null,
  })))
})

// GET /api/parsewords/admin/models
// Returns available model keys for puzzle generation
parsewords.get('/admin/models', (c) => {
  requireAdmin(c)
  return c.json(Object.keys(OPENROUTER_MODELS))
})

// In-memory job store for async generation (admin-only, no persistence needed)
type GenerationJob =
  | { status: 'pending' }
  | { status: 'success'; puzzle: unknown }
  | { status: 'error'; message: string }

const generationJobs = new Map<string, GenerationJob>()

// Auto-clean jobs after 10 minutes
function scheduleJobCleanup(requestId: string) {
  setTimeout(() => generationJobs.delete(requestId), 10 * 60 * 1000)
}

// POST /api/parsewords/admin/generate
// Starts async generation and returns a requestId immediately (202)
parsewords.post('/admin/generate', async (c) => {
  requireAdmin(c)
  const body = await c.req.json().catch(() => ({}))
  const { puzzleId, clueNumber, direction, modelKey } = body

  if (!puzzleId || !clueNumber || !direction) {
    throw new HTTPException(400, { message: 'Missing puzzleId, clueNumber, or direction' })
  }

  const row = await db('clue_explanations')
    .where({ puzzle_id: puzzleId, clue_number: clueNumber, direction })
    .first()

  if (!row) {
    throw new HTTPException(404, { message: 'No explanation found for this clue' })
  }

  const requestId = crypto.randomUUID()
  generationJobs.set(requestId, { status: 'pending' })
  scheduleJobCleanup(requestId)

  // Fire-and-forget
  const modelSlug = modelKey ? (OPENROUTER_MODELS[modelKey as keyof typeof OPENROUTER_MODELS] ?? undefined) : undefined
  const explanation = JSON.parse(row.explanation_json)
  ;(async () => {
    try {
      const puzzle = await generateParsewordsPuzzle(row.clue_text, row.answer, explanation, modelSlug)
      generationJobs.set(requestId, { status: 'success', puzzle })
    } catch (e: any) {
      generationJobs.set(requestId, { status: 'error', message: e?.message ?? 'Generation failed' })
    }
  })()

  return c.json({ requestId }, 202)
})

// GET /api/parsewords/admin/generate/:requestId
// Poll for generation status
parsewords.get('/admin/generate/:requestId', (c) => {
  requireAdmin(c)
  const requestId = c.req.param('requestId')
  const job = generationJobs.get(requestId)
  if (!job) throw new HTTPException(404, { message: 'Unknown requestId' })
  return c.json(job)
})

// POST /api/parsewords/admin/save
// Save (upsert) a parsewords puzzle definition
parsewords.post('/admin/save', async (c) => {
  requireAdmin(c)
  const body = await c.req.json().catch(() => ({}))
  const { puzzleId, clueNumber, direction, puzzle } = body

  if (!puzzleId || !clueNumber || !direction || !puzzle) {
    throw new HTTPException(400, { message: 'Missing required fields' })
  }

  await db('parsewords_puzzles')
    .insert({
      puzzle_id: puzzleId,
      clue_number: clueNumber,
      direction,
      puzzle_json: JSON.stringify(puzzle),
      updated_at: new Date(),
    })
    .onConflict(['puzzle_id', 'clue_number', 'direction'])
    .merge(['puzzle_json', 'updated_at'])

  return c.json({ ok: true })
})

export { parsewords }
