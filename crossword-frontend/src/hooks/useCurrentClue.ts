import { useMemo } from 'react'
import { useSelector } from 'react-redux'
import { selectGrid, selectClues, selectAnswers, selectCursor } from '@/store/selectors/puzzleSelectors'
import { extractClueMetadata } from '@/utils/answerChecker'
import { useAnswerChecker } from './useAnswerChecker'

export function useCurrentClue(currentClueNumber: number | null) {
  const grid = useSelector(selectGrid)
  const clues = useSelector(selectClues)
  const answers = useSelector(selectAnswers)
  const cursor = useSelector(selectCursor)
  const { getSolution } = useAnswerChecker()

  const clueMetadata = useMemo(() => extractClueMetadata(grid), [grid])

  const currentClue = useMemo(() => {
    if (!clues || currentClueNumber === null || !cursor?.direction) return null
    const clueList = cursor.direction === 'across' ? clues.across : clues.down
    return clueList.find((c) => c.number === currentClueNumber) || null
  }, [clues, currentClueNumber, cursor])

  const currentWordState = useMemo(() => {
    if (!cursor || grid.length === 0) return []

    const cells: string[] = []
    let r = cursor.r
    let c = cursor.c

    if (cursor.direction === 'across') {
      while (c > 0 && grid[r][c - 1] !== 'B') c--
      while (c < grid[0].length && grid[r][c] !== 'B') {
        cells.push(answers[r]?.[c] || ' ')
        c++
      }
    } else {
      while (r > 0 && grid[r - 1][c] !== 'B') r--
      while (r < grid.length && grid[r][c] !== 'B') {
        cells.push(answers[r]?.[c] || ' ')
        r++
      }
    }

    return cells
  }, [cursor, grid, answers])

  const handleFetchHintAnswer = useMemo(() => {
    return async () => {
      if (!cursor || !currentClueNumber) {
        throw new Error('No active clue')
      }

      const solution = getSolution(currentClueNumber, cursor.direction)
      if (solution) {
        return solution
      }
      throw new Error('Hint not found')
    }
  }, [cursor, currentClueNumber, getSolution])

  return { clueMetadata, currentClue, currentWordState, handleFetchHintAnswer }
}
