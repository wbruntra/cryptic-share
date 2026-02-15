import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { requireAdmin, type AuthUser } from '../hono-middleware/auth'
import { PuzzleService } from '../services/puzzleService'
import { generateGrid } from '../utils/openrouter'

type Variables = { user: AuthUser | null }

const puzzles = new Hono<{ Variables: Variables }>()

// POST /api/puzzles/generate-grid
puzzles.post('/generate-grid', async (c) => {
  requireAdmin(c)
  const body = await c.req.json().catch(() => ({}))
  const { image } = body

  if (!image) {
    throw new HTTPException(400, { message: 'Missing image data' })
  }

  try {
    const matches = image.match(/^data:([A-Za-z-+\\/]+);base64,(.+)$/)

    if (!matches || matches.length !== 3) {
      throw new HTTPException(400, { message: 'Invalid image data format' })
    }

    const mimeType = matches[1]
    const base64 = matches[2]

    const gridData = await generateGrid({ base64, mimeType })
    return c.json(gridData)
  } catch (error: any) {
    if (error instanceof HTTPException) throw error
    console.error('Error generating grid:', error)
    throw new HTTPException(500, { message: 'Failed to generate grid' })
  }
})

// GET /api/puzzles
puzzles.get('/', async (c) => {
  try {
    const allPuzzles = await PuzzleService.getAllPuzzles()
    return c.json(allPuzzles)
  } catch (error) {
    console.error('Error fetching puzzles:', error)
    throw new HTTPException(500, { message: 'Failed to fetch puzzles' })
  }
})

// GET /api/puzzles/missing-clues
puzzles.get('/missing-clues', async (c) => {
  try {
    const rows = await PuzzleService.getPuzzlesMissingClues()
    return c.json(rows)
  } catch (error) {
    console.error('Error fetching puzzles missing clues:', error)
    throw new HTTPException(500, { message: 'Failed to fetch puzzles missing clues' })
  }
})

// GET /api/puzzles/:id
puzzles.get('/:id', async (c) => {
  const id = c.req.param('id')

  try {
    const puzzle = await PuzzleService.getPuzzleById(Number(id))

    if (puzzle) {
      return c.json(puzzle)
    } else {
      throw new HTTPException(404, { message: 'Puzzle not found' })
    }
  } catch (error: any) {
    if (error instanceof HTTPException) throw error
    console.error('Error fetching puzzle:', error)
    throw new HTTPException(500, { message: 'Failed to fetch puzzle' })
  }
})

// POST /api/puzzles
puzzles.post('/', async (c) => {
  requireAdmin(c)
  const body = await c.req.json().catch(() => ({}))
  const { title, grid, clues, answers } = body

  if (!title || !grid || !clues) {
    throw new HTTPException(400, { message: 'Missing required fields: title, grid, clues' })
  }

  try {
    const serviceClues = { ...clues, answers_encrypted: answers }
    const puzzle = await PuzzleService.createPuzzle(title, grid, serviceClues)
    return c.json(puzzle)
  } catch (error) {
    console.error('Error creating puzzle:', error)
    throw new HTTPException(500, { message: 'Failed to create puzzle' })
  }
})

// PUT /api/puzzles/:id
puzzles.put('/:id', async (c) => {
  requireAdmin(c)
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => ({}))
  const { grid, clues, title, answers } = body

  try {
    const result = await PuzzleService.updatePuzzle(Number(id), {
      grid,
      clues,
      title,
      answers,
    } as any)

    if (result === null) {
      throw new HTTPException(404, { message: 'Puzzle not found' })
    }

    if (!result.updated) {
      throw new HTTPException(400, { message: result.message })
    }

    return c.json({ success: true, id: result.id })
  } catch (error: any) {
    if (error instanceof HTTPException) throw error
    console.error('Error updating puzzle:', error)
    throw new HTTPException(500, { message: 'Failed to update puzzle' })
  }
})

// DELETE /api/puzzles/:id
puzzles.delete('/:id', async (c) => {
  requireAdmin(c)
  const id = c.req.param('id')

  try {
    const deleted = await PuzzleService.deletePuzzle(Number(id))

    if (!deleted) {
      throw new HTTPException(404, { message: 'Puzzle not found' })
    }

    return c.json({ success: true, id })
  } catch (error: any) {
    if (error instanceof HTTPException) throw error
    console.error('Error deleting puzzle:', error)
    throw new HTTPException(500, { message: 'Failed to delete puzzle' })
  }
})

export { puzzles }
