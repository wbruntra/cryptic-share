import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import db from '../db-knex'
import { PuzzleService } from '../services/puzzleService'

describe('PuzzleService', () => {
  beforeEach(async () => {
    // Run migrations to ensure schema exists
    await db.migrate.latest()
    // Clean up
    await db('puzzle_sessions').del()
    await db('puzzles').del()
  })

  afterEach(async () => {
    await db.migrate.rollback()
  })

  describe('getAllPuzzles', () => {
    it('should return empty array when no puzzles exist', async () => {
      const puzzles = await PuzzleService.getAllPuzzles()
      expect(puzzles).toEqual([])
    })

    it('should return all puzzles with id and title only', async () => {
      await db('puzzles').insert([
        { id: 1, title: 'Puzzle 1', grid: '[]', clues: '[]' },
        { id: 2, title: 'Puzzle 2', grid: '[]', clues: '[]' },
      ])

      const puzzles = await PuzzleService.getAllPuzzles()
      expect(puzzles).toHaveLength(2)
      expect(puzzles[0]).toHaveProperty('id')
      expect(puzzles[0]).toHaveProperty('title')
      expect(puzzles[0]).not.toHaveProperty('grid')
      expect(puzzles[0]).not.toHaveProperty('clues')
    })
  })

  describe('getPuzzleById', () => {
    it('should return null when puzzle does not exist', async () => {
      const puzzle = await PuzzleService.getPuzzleById(999)
      expect(puzzle).toBeNull()
    })

    it('should return puzzle with parsed clues', async () => {
      const testClues = [{ number: 1, clue: 'Test clue', answer: 'TEST' }]
      await db('puzzles').insert({
        id: 1,
        title: 'Test Puzzle',
        grid: '[[1,2,3]]',
        clues: JSON.stringify(testClues),
      })

      const puzzle = await PuzzleService.getPuzzleById(1)
      expect(puzzle).not.toBeNull()
      expect(puzzle?.title).toBe('Test Puzzle')
      expect(puzzle?.grid).toBe('[[1,2,3]]')
      expect(puzzle?.clues).toEqual(testClues)
    })
  })

  describe('createPuzzle', () => {
    it('should create a new puzzle and return it', async () => {
      const testClues = [{ number: 1, clue: 'Test', answer: 'ANSWER' }]
      const result = await PuzzleService.createPuzzle('New Puzzle', '[[1]]', testClues)

      expect(result).toHaveProperty('id')
      expect(result.title).toBe('New Puzzle')
      expect(result.grid).toBe('[[1]]')
      expect(result.clues).toEqual(testClues)

      // Verify in database
      const dbPuzzle: any = await db('puzzles').where({ id: result.id }).first()
      expect(dbPuzzle).toBeDefined()
      expect(dbPuzzle.title).toBe('New Puzzle')
    })
  })

  describe('updatePuzzle', () => {
    beforeEach(async () => {
      await db('puzzles').insert({
        id: 1,
        title: 'Original',
        grid: '[[1]]',
        clues: '[]',
      })
    })

    it('should return null when puzzle does not exist', async () => {
      const result = await PuzzleService.updatePuzzle(999, { title: 'Updated' })
      expect(result).toBeNull()
    })

    it('should return error when no fields to update', async () => {
      const result = await PuzzleService.updatePuzzle(1, {})
      expect(result).toEqual({ updated: false, message: 'No fields to update' })
    })

    it('should update title', async () => {
      const result = await PuzzleService.updatePuzzle(1, { title: 'Updated Title' })
      expect(result).toEqual({ updated: true, id: 1 })

      const dbPuzzle: any = await db('puzzles').where({ id: 1 }).first()
      expect(dbPuzzle.title).toBe('Updated Title')
    })

    it('should update grid', async () => {
      const result = await PuzzleService.updatePuzzle(1, { grid: '[[2,3]]' })
      expect(result).toEqual({ updated: true, id: 1 })

      const dbPuzzle: any = await db('puzzles').where({ id: 1 }).first()
      expect(dbPuzzle.grid).toBe('[[2,3]]')
    })

    it('should update clues and stringify them', async () => {
      const newClues = [{ number: 1, clue: 'New', answer: 'CLUE' }]
      const result = await PuzzleService.updatePuzzle(1, { clues: newClues })
      expect(result).toEqual({ updated: true, id: 1 })

      const dbPuzzle: any = await db('puzzles').where({ id: 1 }).first()
      expect(JSON.parse(dbPuzzle.clues)).toEqual(newClues)
    })

    it('should update multiple fields at once', async () => {
      const newClues = [{ number: 2, clue: 'Multi', answer: 'UPDATE' }]
      const result = await PuzzleService.updatePuzzle(1, {
        title: 'Multi Update',
        grid: '[[5]]',
        clues: newClues,
      })
      expect(result).toEqual({ updated: true, id: 1 })

      const dbPuzzle: any = await db('puzzles').where({ id: 1 }).first()
      expect(dbPuzzle.title).toBe('Multi Update')
      expect(dbPuzzle.grid).toBe('[[5]]')
      expect(JSON.parse(dbPuzzle.clues)).toEqual(newClues)
    })
  })

  describe('deletePuzzle', () => {
    it('should return false when puzzle does not exist', async () => {
      const deleted = await PuzzleService.deletePuzzle(999)
      expect(deleted).toBe(false)
    })

    it('should delete puzzle and return true', async () => {
      await db('puzzles').insert({
        id: 1,
        title: 'To Delete',
        grid: '[]',
        clues: '[]',
      })

      const deleted = await PuzzleService.deletePuzzle(1)
      expect(deleted).toBe(true)

      const dbPuzzle = await db('puzzles').where({ id: 1 }).first()
      expect(dbPuzzle).toBeUndefined()
    })
  })
})
