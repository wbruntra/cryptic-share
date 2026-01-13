import db from '../db-knex'
import { calculateLetterCount } from '../utils/stateHelpers'

export class PuzzleService {
  static async getAllPuzzles() {
    return await db('puzzles').select('id', 'title')
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
