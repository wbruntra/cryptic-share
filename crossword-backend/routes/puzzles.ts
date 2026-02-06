import { Router, jsonResponse, HttpError, type Context } from '../http/router'
import { requireAdmin } from '../middleware/auth'
import { PuzzleService } from '../services/puzzleService'
import { generateGrid } from '../utils/openrouter'

export function registerPuzzleRoutes(router: Router) {
  router.post('/api/puzzles/generate-grid', handleGenerateGrid)
  router.get('/api/puzzles', handleGetAllPuzzles)
  router.get('/api/puzzles/:id', handleGetPuzzleById)
  router.post('/api/puzzles', handleCreatePuzzle)
  router.put('/api/puzzles/:id', handleUpdatePuzzle)
  router.delete('/api/puzzles/:id', handleDeletePuzzle)
}

// Generate grid from image
async function handleGenerateGrid(ctx: Context) {
  requireAdmin(ctx)
  const body = ctx.body as any
  const { image } = body || {}

  if (!image) {
    throw new HttpError(400, { error: 'Missing image data' })
  }

  try {
    const matches = image.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/)

    if (!matches || matches.length !== 3) {
      throw new HttpError(400, { error: 'Invalid image data format' })
    }

    const mimeType = matches[1]
    const base64 = matches[2]

    const gridData = await generateGrid({ base64, mimeType })
    return jsonResponse(gridData)
  } catch (error: any) {
    if (error instanceof HttpError) throw error
    console.error('Error generating grid:', error)
    throw new HttpError(500, { error: 'Failed to generate grid', details: error.message })
  }
}

// Get all puzzles (metadata only)
async function handleGetAllPuzzles(ctx: Context) {
  try {
    const puzzles = await PuzzleService.getAllPuzzles()
    return jsonResponse(puzzles)
  } catch (error) {
    console.error('Error fetching puzzles:', error)
    throw new HttpError(500, { error: 'Failed to fetch puzzles' })
  }
}

// Get specific puzzle
async function handleGetPuzzleById(ctx: Context) {
  const { id } = ctx.params as any

  try {
    const puzzle = await PuzzleService.getPuzzleById(Number(id))

    if (puzzle) {
      return jsonResponse(puzzle)
    } else {
      throw new HttpError(404, { error: 'Puzzle not found' })
    }
  } catch (error: any) {
    if (error instanceof HttpError) throw error
    console.error('Error fetching puzzle:', error)
    throw new HttpError(500, { error: 'Failed to fetch puzzle' })
  }
}

// Create new puzzle
async function handleCreatePuzzle(ctx: Context) {
  requireAdmin(ctx)
  const body = ctx.body as any
  const { title, grid, clues, answers } = body || {}

  if (!title || !grid || !clues) {
    throw new HttpError(400, { error: 'Missing required fields: title, grid, clues' })
  }

  try {
    const serviceClues = { ...clues, answers_encrypted: answers }
    const puzzle = await PuzzleService.createPuzzle(title, grid, serviceClues)
    return jsonResponse(puzzle)
  } catch (error) {
    console.error('Error creating puzzle:', error)
    throw new HttpError(500, { error: 'Failed to create puzzle' })
  }
}

// Update puzzle grid, clues, or title
async function handleUpdatePuzzle(ctx: Context) {
  requireAdmin(ctx)
  const { id } = ctx.params as any
  const body = ctx.body as any
  const { grid, clues, title, answers } = body || {}

  try {
    const result = await PuzzleService.updatePuzzle(Number(id), {
      grid,
      clues,
      title,
      answers,
    } as any)

    if (result === null) {
      throw new HttpError(404, { error: 'Puzzle not found' })
    }

    if (!result.updated) {
      throw new HttpError(400, { error: result.message })
    }

    return jsonResponse({ success: true, id: result.id })
  } catch (error: any) {
    if (error instanceof HttpError) throw error
    console.error('Error updating puzzle:', error)
    throw new HttpError(500, { error: 'Failed to update puzzle' })
  }
}

// Delete puzzle
async function handleDeletePuzzle(ctx: Context) {
  requireAdmin(ctx)
  const { id } = ctx.params as any

  try {
    const deleted = await PuzzleService.deletePuzzle(Number(id))

    if (!deleted) {
      throw new HttpError(404, { error: 'Puzzle not found' })
    }

    return jsonResponse({ success: true, id })
  } catch (error: any) {
    if (error instanceof HttpError) throw error
    console.error('Error deleting puzzle:', error)
    throw new HttpError(500, { error: 'Failed to delete puzzle' })
  }
}
