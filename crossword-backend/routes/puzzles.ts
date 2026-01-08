import { Router } from 'express'
import { requireAdmin } from '../middleware/auth'
import { PuzzleService } from '../services/puzzleService'

const router = Router()

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
  const { title, grid, clues } = req.body

  if (!title || !grid || !clues) {
    return res.status(400).json({ error: 'Missing required fields: title, grid, clues' })
  }

  try {
    const puzzle = await PuzzleService.createPuzzle(title, grid, clues)
    res.status(201).json(puzzle)
  } catch (error) {
    console.error('Error creating puzzle:', error)
    res.status(500).json({ error: 'Failed to create puzzle' })
  }
})

// Update puzzle grid, clues, or title
router.put('/:id', requireAdmin, async (req, res) => {
  const { id } = req.params
  const { grid, clues, title } = req.body

  try {
    const result = await PuzzleService.updatePuzzle(Number(id), { grid, clues, title })

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
