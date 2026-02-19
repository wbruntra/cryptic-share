import type { CellType, Direction } from '@/types'
import { extractClueMetadata } from './answerChecker'

/**
 * Get all cell keys for a specific clue (word)
 * Returns array of "r-c" strings
 */
export function getCellsForClue(
  grid: CellType[][],
  clueNumber: number,
  direction: Direction,
): string[] {
  if (!grid || grid.length === 0) return []

  const metadata = extractClueMetadata(grid)
  const clueMeta = metadata.find((m) => m.number === clueNumber && m.direction === direction)

  if (!clueMeta) return []

  const cells: string[] = []
  let r = clueMeta.row
  let c = clueMeta.col

  while (r < grid.length && c < grid[0].length && grid[r][c] !== 'B') {
    cells.push(`${r}-${c}`)
    if (direction === 'across') c++
    else r++
  }

  return cells
}
