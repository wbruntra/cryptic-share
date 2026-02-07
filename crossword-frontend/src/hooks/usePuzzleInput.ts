import { useEffect, useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { 
  updateCell, 
  moveCursor, 
  toggleDirection 
} from '@/store/slices/puzzleSlice'
import { useAnswerChecker } from './useAnswerChecker'
import type { AppDispatch, RootState } from '@/store/store'
import type { Direction } from '@/types'

// Selectors
const selectCursor = (state: RootState) => state.puzzle.cursor
const selectGrid = (state: RootState) => state.puzzle.grid
const selectAnswers = (state: RootState) => state.puzzle.answers
const selectIsHintModalOpen = (state: RootState) => state.puzzle.isHintModalOpen

export function usePuzzleInput(
  sendCellUpdate: (r: number, c: number, value: string) => void,
  onCheckWord?: (clueNumber: number, direction: Direction, answersOverride?: string[]) => void
) {
  const dispatch = useDispatch<AppDispatch>()
  const cursor = useSelector(selectCursor)
  const isHintModalOpen = useSelector(selectIsHintModalOpen)
  const grid = useSelector(selectGrid)
  const answers = useSelector(selectAnswers)
  const { getCurrentClueNumber } = useAnswerChecker()
  
  const handleUpdateCell = useCallback((value: string): string[] | null => {
    if (!cursor) return null

    dispatch(updateCell({ r: cursor.r, c: cursor.c, value }))
    sendCellUpdate(cursor.r, cursor.c, value)

    const newAnswers = [...answers]
    const row = newAnswers[cursor.r] || ''
    newAnswers[cursor.r] = row.substring(0, cursor.c) + value + row.substring(cursor.c + 1)

    return newAnswers
  }, [cursor, answers, dispatch, sendCellUpdate])
  
  const handleMoveCursor = useCallback((direction: Direction, delta: number) => {
    dispatch(moveCursor({ direction, delta }))
  }, [dispatch])
  
  // Check if we should verify the current word
  const maybeCheckWord = useCallback((direction: Direction, answersOverride?: string[]) => {
    if (!cursor || !onCheckWord) return

    // Get the clue number for the current position
    const clueNumber = getCurrentClueNumber(cursor.r, cursor.c, direction)
    if (clueNumber) {
      onCheckWord(clueNumber, direction, answersOverride)
    }
  }, [cursor, onCheckWord, getCurrentClueNumber])
  
  // Check if we hit a boundary (black cell or edge of grid)
  const isAtBoundary = useCallback((r: number, c: number, direction: Direction, delta: number): boolean => {
    if (grid.length === 0) return true
    
    const nextR = direction === 'down' ? r + delta : r
    const nextC = direction === 'across' ? c + delta : c
    
    // Check if out of bounds
    if (nextR < 0 || nextR >= grid.length || nextC < 0 || nextC >= grid[0].length) {
      return true
    }
    
    // Check if next cell is black
    return grid[nextR][nextC] === 'B'
  }, [grid])
  
  // Physical keyboard handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't handle if user is typing in an input
      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return
      }
      
      if (!cursor || isHintModalOpen) return
      
      const key = e.key
      
      // Letter input
      if (key.match(/^[a-zA-Z]$/)) {
        e.preventDefault()
        const updatedAnswers = handleUpdateCell(key.toUpperCase())

        // Check if we're at the end of the word before moving
        const atBoundary = isAtBoundary(cursor.r, cursor.c, cursor.direction, 1)

        handleMoveCursor(cursor.direction, 1)

        // Check word if we just completed the last letter
        if (atBoundary) {
          maybeCheckWord(cursor.direction, updatedAnswers || undefined)
        }
      }
      // Backspace
      else if (key === 'Backspace') {
        e.preventDefault()
        handleUpdateCell(' ')
        handleMoveCursor(cursor.direction, -1)
      }
      // Arrow keys
      else if (key === 'ArrowUp') {
        e.preventDefault()
        handleMoveCursor('down', -1)
      }
      else if (key === 'ArrowDown') {
        e.preventDefault()
        handleMoveCursor('down', 1)
      }
      else if (key === 'ArrowLeft') {
        e.preventDefault()
        handleMoveCursor('across', -1)
      }
      else if (key === 'ArrowRight') {
        e.preventDefault()
        handleMoveCursor('across', 1)
      }
      // Tab to toggle direction
      else if (key === 'Tab') {
        e.preventDefault()
        dispatch(toggleDirection())
      }
    }
    
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [cursor, isHintModalOpen, handleUpdateCell, handleMoveCursor, dispatch, isAtBoundary, maybeCheckWord])
  
  // Return handlers for virtual keyboard
  return {
    onVirtualKeyPress: (key: string) => {
      if (!cursor) return
      const atBoundary = isAtBoundary(cursor.r, cursor.c, cursor.direction, 1)
      const updatedAnswers = handleUpdateCell(key.toUpperCase())
      handleMoveCursor(cursor.direction, 1)
      if (atBoundary) {
        maybeCheckWord(cursor.direction, updatedAnswers || undefined)
      }
    },
    onVirtualDelete: () => {
      if (!cursor) return
      handleUpdateCell(' ')
      handleMoveCursor(cursor.direction, -1)
    },
  }
}
