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
    return puzzle
  }

  static async createPuzzle(title: string, grid: string, clues: any) {
    const letterCount = calculateLetterCount(grid)
    const [id] = await db('puzzles').insert({
      title,
      grid,
      clues: JSON.stringify(clues),
      letter_count: letterCount,
    })

    return { id, title, grid, clues, letter_count: letterCount }
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
