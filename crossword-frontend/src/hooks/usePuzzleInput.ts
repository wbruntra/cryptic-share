import { useEffect, useCallback, useRef } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { updateCell, moveCursor, toggleDirection } from '@/store/slices/puzzleSlice'
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
  onCheckWord?: (clueNumber: number, direction: Direction, answersOverride?: string[]) => void,
) {
  const dispatch = useDispatch<AppDispatch>()
  const cursor = useSelector(selectCursor)
  const isHintModalOpen = useSelector(selectIsHintModalOpen)
  const grid = useSelector(selectGrid)
  const answers = useSelector(selectAnswers)
  const { getCurrentClueNumber } = useAnswerChecker()

  // Refs for stable callbacks
  const cursorRef = useRef(cursor)
  const gridRef = useRef(grid)
  const answersRef = useRef(answers)
  const isHintModalOpenRef = useRef(isHintModalOpen)
  const onCheckWordRef = useRef(onCheckWord)
  const sendCellUpdateRef = useRef(sendCellUpdate)

  useEffect(() => {
    cursorRef.current = cursor
    gridRef.current = grid
    answersRef.current = answers
    isHintModalOpenRef.current = isHintModalOpen
    onCheckWordRef.current = onCheckWord
    sendCellUpdateRef.current = sendCellUpdate
  }, [cursor, grid, answers, isHintModalOpen, onCheckWord, sendCellUpdate])

  const handleUpdateCell = useCallback(
    (value: string): string[] | null => {
      const currentCursor = cursorRef.current
      if (!currentCursor) return null

      dispatch(updateCell({ r: currentCursor.r, c: currentCursor.c, value }))
      sendCellUpdateRef.current(currentCursor.r, currentCursor.c, value)

      const currentAnswers = answersRef.current
      const newAnswers = [...currentAnswers]
      const row = newAnswers[currentCursor.r] || ''
      newAnswers[currentCursor.r] =
        row.substring(0, currentCursor.c) + value + row.substring(currentCursor.c + 1)

      return newAnswers
    },
    [dispatch],
  )

  const handleMoveCursor = useCallback(
    (direction: Direction, delta: number) => {
      dispatch(moveCursor({ direction, delta }))
    },
    [dispatch],
  )

  // Check if we should verify the current word
  const maybeCheckWord = useCallback(
    (direction: Direction, answersOverride?: string[]) => {
      const currentCursor = cursorRef.current
      const checkCallback = onCheckWordRef.current

      if (!currentCursor || !checkCallback) return

      // Get the clue number for the current position
      const clueNumber = getCurrentClueNumber(currentCursor.r, currentCursor.c, direction)
      if (clueNumber) {
        checkCallback(clueNumber, direction, answersOverride)
      }
    },
    [getCurrentClueNumber],
  )

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

      const currentCursor = cursorRef.current
      const hintOpen = isHintModalOpenRef.current

      if (!currentCursor || hintOpen) return

      const key = e.key

      // Letter input
      if (key.match(/^[a-zA-Z]$/)) {
        e.preventDefault()
        const updatedAnswers = handleUpdateCell(key.toUpperCase())
        handleMoveCursor(currentCursor.direction, 1)

        // Check word if we just completed the last letter
        maybeCheckWord(currentCursor.direction, updatedAnswers || undefined)
      }
      // Backspace
      else if (key === 'Backspace') {
        e.preventDefault()
        handleUpdateCell(' ')
        handleMoveCursor(currentCursor.direction, -1)
      }
      // Arrow keys
      else if (key === 'ArrowUp') {
        e.preventDefault()
        handleMoveCursor('down', -1)
      } else if (key === 'ArrowDown') {
        e.preventDefault()
        handleMoveCursor('down', 1)
      } else if (key === 'ArrowLeft') {
        e.preventDefault()
        handleMoveCursor('across', -1)
      } else if (key === 'ArrowRight') {
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
  }, [handleUpdateCell, handleMoveCursor, dispatch, maybeCheckWord])

  // Return handlers for virtual keyboard
  return {
    onVirtualKeyPress: useCallback(
      (key: string) => {
        const currentCursor = cursorRef.current
        if (!currentCursor) return
        const updatedAnswers = handleUpdateCell(key.toUpperCase())
        handleMoveCursor(currentCursor.direction, 1)
        maybeCheckWord(currentCursor.direction, updatedAnswers || undefined)
      },
      [handleUpdateCell, handleMoveCursor, maybeCheckWord],
    ),
    onVirtualDelete: useCallback(() => {
      const currentCursor = cursorRef.current
      if (!currentCursor) return
      handleUpdateCell(' ')
      handleMoveCursor(currentCursor.direction, -1)
    }, [handleUpdateCell, handleMoveCursor]),
  }
}
