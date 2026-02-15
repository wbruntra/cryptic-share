import db from '../db-knex'
import { calculateLetterCount } from '../utils/stateHelpers'

export class PuzzleService {
  static async getAllPuzzles() {
    return await db('puzzles').select('id', 'title')
  }

  static async getPuzzlesMissingClues() {
    const puzzles: any[] = await db('puzzles').select('id', 'title', 'grid', 'clues', 'book', 'puzzle_number')

    const isPlaceholder = (value: string) => {
      const normalized = value.trim().toUpperCase()
      return normalized === '[CLUE PENDING]' || normalized === 'CLUE PENDING'
    }

    const hasAnyRealClue = (list: any): boolean => {
      if (!Array.isArray(list) || list.length === 0) return false
      return list.some((item) => {
        const clue = typeof item?.clue === 'string' ? item.clue : ''
        return clue.trim().length > 0 && !isPlaceholder(clue)
      })
    }

    const hasMissingClues = (cluesRaw: unknown): boolean => {
      try {
        const clues = typeof cluesRaw === 'string' ? JSON.parse(cluesRaw) : cluesRaw
        const hasAcross = hasAnyRealClue((clues as any)?.across)
        const hasDown = hasAnyRealClue((clues as any)?.down)
        return !(hasAcross && hasDown)
      } catch {
        return true
      }
    }

    return puzzles
      .filter((p) => typeof p.grid === 'string' && p.grid.trim().length > 0)
      .filter((p) => hasMissingClues(p.clues))
      .map((p) => ({
        id: p.id,
        title: p.title,
        book: p.book,
        puzzle_number: p.puzzle_number,
      }))
  }

  static async getPuzzleById(id: number) {
    const puzzle: any = await db('puzzles').where({ id }).first()

    if (!puzzle) {
      return null
    }

    puzzle.clues = JSON.parse(puzzle.clues)
    // Return encrypted answers as 'answers' for frontend compatibility
    // but keep as string since it's encrypted JSON/string
    if (puzzle.answers_encrypted) {
      puzzle.answers = JSON.parse(puzzle.answers_encrypted)
    }
    return puzzle
  }

  static async createPuzzle(title: string, grid: string, clues: any) {
    const letterCount = calculateLetterCount(grid)
    const [id] = await db('puzzles').insert({
      title,
      grid,
      clues: JSON.stringify(clues),
      letter_count: letterCount,
      answers_encrypted: clues.answers_encrypted
        ? JSON.stringify(clues.answers_encrypted)
        : undefined,
      // Hack: populating puzzle_number with title and hardcoding book to 3
      puzzle_number: title as any,
      book: '3',
    })

    return { id, title, grid, clues, letter_count: letterCount, answers: clues.answers_encrypted }
  }

  static async updatePuzzle(id: number, updates: { grid?: string; clues?: any; title?: string }) {
    const exists = await db('puzzles').where({ id }).first()

    if (!exists) {
      return null
    }

    const dbUpdates: any = {}
    if (updates.grid !== undefined) {
      dbUpdates.grid = updates.grid
      // Recalculate letter_count when grid changes
      dbUpdates.letter_count = calculateLetterCount(updates.grid)
    }
    if (updates.clues !== undefined) dbUpdates.clues = JSON.stringify(updates.clues)
    if (updates.title !== undefined) dbUpdates.title = updates.title
    // Handle answers separately if passed in updates (e.g. from frontend as 'answers')
    if ((updates as any).answers !== undefined) {
      dbUpdates.answers_encrypted = JSON.stringify((updates as any).answers)
    }

    if (Object.keys(dbUpdates).length === 0) {
      return { updated: false, message: 'No fields to update' }
    }

    await db('puzzles').where({ id }).update(dbUpdates)
    return { updated: true, id }
  }

  static async deletePuzzle(id: number): Promise<boolean> {
    const deleted = await db('puzzles').where({ id }).del()
    return deleted > 0
  }
}
