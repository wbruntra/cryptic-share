import { useMemo } from 'react'
import { useSelector } from 'react-redux'
import type { RootState } from '@/store/store'
import type { CellType, RenderedCell } from '@/types'

// Selectors
const selectGrid = (state: RootState) => state.puzzle.grid
const selectAnswers = (state: RootState) => state.puzzle.answers
const selectCursor = (state: RootState) => state.puzzle.cursor

/**
 * Computes the set of cell keys that are part of the currently active word.
 * Returns O(n) where n is the word length, not O(n²) for the entire grid.
 */
export function useActiveWordCells(): Set<string> {
  const grid = useSelector(selectGrid)
  const cursor = useSelector(selectCursor)

  return useMemo(() => {
    const activeCells = new Set<string>()

    if (!cursor || grid.length === 0) return activeCells

    const { r: cursorR, c: cursorC, direction } = cursor

    if (direction === 'across') {
      // Find word boundaries in this row
      let startC = cursorC
      while (startC > 0 && grid[cursorR][startC - 1] !== 'B') startC--
      let endC = cursorC
      while (endC < grid[0].length - 1 && grid[cursorR][endC + 1] !== 'B') endC++

      // Mark all cells in the word
      for (let c = startC; c <= endC; c++) {
        activeCells.add(`${cursorR}-${c}`)
      }
    } else {
      // Find word boundaries in this column
      let startR = cursorR
      while (startR > 0 && grid[startR - 1][cursorC] !== 'B') startR--
      let endR = cursorR
      while (endR < grid.length - 1 && grid[endR + 1][cursorC] !== 'B') endR++

      // Mark all cells in the word
      for (let r = startR; r <= endR; r++) {
        activeCells.add(`${r}-${cursorC}`)
      }
    }

    return activeCells
  }, [grid, cursor])
}

/**
 * Computes the grid structure with cell numbers. This is memoized on grid only
 * (changes rarely) and does NOT depend on cursor position.
 */
export function useGridStructure(): {
  gridWithNumbers: Array<Array<{ type: CellType; number: number | null }>>
  currentClueNumber: number | null
} {
  const grid = useSelector(selectGrid)
  const cursor = useSelector(selectCursor)

  const gridWithNumbers = useMemo(() => {
    if (grid.length === 0) return []

    let currentNumber = 1
    return grid.map((row) =>
      row.map((cell) => {
        let number = null
        if (cell === 'N') {
          number = currentNumber
          currentNumber++
        }
        return { type: cell, number }
      }),
    )
  }, [grid])

  // Calculate current clue number based on cursor position
  const currentClueNumber = useMemo(() => {
    if (!cursor || gridWithNumbers.length === 0) return null

    let r = cursor.r
    let c = cursor.c

    if (cursor.direction === 'across') {
      while (c > 0 && grid[r][c - 1] !== 'B') c--
    } else {
      while (r > 0 && grid[r - 1][c] !== 'B') r--
    }

    return gridWithNumbers[r]?.[c]?.number ?? null
  }, [cursor, grid, gridWithNumbers])

  return { gridWithNumbers, currentClueNumber }
}

/**
 * Combines grid structure with answers and active word state to produce
 * the final rendered grid. Optimized to only re-compute when necessary
 * dependencies change.
 */
export function useRenderedGrid(): {
  renderedGrid: RenderedCell[]
  currentClueNumber: number | null
} {
  const grid = useSelector(selectGrid)
  const answers = useSelector(selectAnswers)
  const cursor = useSelector(selectCursor)
  const { gridWithNumbers, currentClueNumber } = useGridStructure()
  const activeWordCells = useActiveWordCells()

  const renderedGrid = useMemo(() => {
    if (grid.length === 0) return []

    return gridWithNumbers.map((row, r) =>
      row.map((cell, c) => {
        const cellKey = `${r}-${c}`
        const isSelected = cursor?.r === r && cursor?.c === c

        return {
          type: cell.type,
          number: cell.number,
          isSelected,
          isActiveWord: activeWordCells.has(cellKey),
          answer: answers[r]?.[c] || ' ',
        }
      }),
    )
  }, [gridWithNumbers, answers, cursor, activeWordCells])

  return { renderedGrid: renderedGrid.flat(), currentClueNumber }
}
