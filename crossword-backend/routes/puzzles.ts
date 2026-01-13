import { Router } from 'express'
import { requireAdmin } from '../middleware/auth'
import { PuzzleService } from '../services/puzzleService'
import { generateGrid } from '../utils/openrouter'

const router = Router()

// Generate grid from image
router.post('/generate-grid', requireAdmin, async (req, res) => {
  const { image } = req.body

  if (!image) {
    return res.status(400).json({ error: 'Missing image data' })
  }

  try {
    // Extract base64 data and mime type
    const matches = image.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/)

    if (!matches || matches.length !== 3) {
      return res.status(400).json({ error: 'Invalid image data format' })
    }

    const mimeType = matches[1]
    const base64 = matches[2]

    const gridData = await generateGrid({ base64, mimeType })
    res.json(gridData)
  } catch (error: any) {
    console.error('Error generating grid:', error)
    res.status(500).json({ error: 'Failed to generate grid', details: error.message })
  }
})

// Get all puzzles (metadata only)
router.get('/', async (req, res) => {
  try {
    const puzzles = await PuzzleService.getAllPuzzles()
    res.json(puzzles)
  } catch (error) {
    console.error('Error fetching puzzles:', error)
    res.status(500).json({ error: 'Failed to fetch puzzles' })
  }
})

// Get specific puzzle
router.get('/:id', async (req, res) => {
  const { id } = req.params
  try {
    const puzzle = await PuzzleService.getPuzzleById(Number(id))

    if (puzzle) {
      res.json(puzzle)
    } else {
      res.status(404).json({ error: 'Puzzle not found' })
    }
  } catch (error) {
    console.error('Error fetching puzzle:', error)
    res.status(500).json({ error: 'Failed to fetch puzzle' })
  }
})

// Create new puzzle
router.post('/', requireAdmin, async (req, res) => {
  const { title, grid, clues, answers } = req.body

  if (!title || !grid || !clues) {
    return res.status(400).json({ error: 'Missing required fields: title, grid, clues' })
  }

  try {
    // Pass 'answers' as part of the 'clues' object trick or separate argument if we refactored createPuzzle.
    // Looking at PuzzleService.createPuzzle signature: createPuzzle(title, grid, clues).
    // I need to attach answers_encrypted to clues object to pass it through based on my service change.
    const serviceClues = { ...clues, answers_encrypted: answers }

    const puzzle = await PuzzleService.createPuzzle(title, grid, serviceClues)
    res.status(201).json(puzzle)
  } catch (error) {
    console.error('Error creating puzzle:', error)
    res.status(500).json({ error: 'Failed to create puzzle' })
  }
})

// Update puzzle grid, clues, or title
router.put('/:id', requireAdmin, async (req, res) => {
  const { id } = req.params
  const { grid, clues, title, answers } = req.body

  try {
    const result = await PuzzleService.updatePuzzle(Number(id), {
      grid,
      clues,
      title,
      answers,
    } as any)

    if (result === null) {
      return res.status(404).json({ error: 'Puzzle not found' })
    }

    if (!result.updated) {
      return res.status(400).json({ error: result.message })
    }

    res.json({ success: true, id: result.id })
  } catch (error) {
    console.error('Error updating puzzle:', error)
    res.status(500).json({ error: 'Failed to update puzzle' })
  }
})

// Delete puzzle
router.delete('/:id', requireAdmin, async (req, res) => {
  const { id } = req.params

  try {
    const deleted = await PuzzleService.deletePuzzle(Number(id))

    if (!deleted) {
      return res.status(404).json({ error: 'Puzzle not found' })
    }

    res.json({ success: true, id })
  } catch (error) {
    console.error('Error deleting puzzle:', error)
    res.status(500).json({ error: 'Failed to delete puzzle' })
  }
})

export default router
