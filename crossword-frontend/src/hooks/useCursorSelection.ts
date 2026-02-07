import { useCallback, useMemo } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { setCursor, toggleDirection } from '@/store/slices/puzzleSlice'
import type { AppDispatch, RootState } from '@/store/store'
import type { Direction } from '@/types'

// Selectors
const selectGrid = (state: RootState) => state.puzzle.grid
const selectCursor = (state: RootState) => state.puzzle.cursor

export function useCursorSelection() {
  const dispatch = useDispatch<AppDispatch>()
  const grid = useSelector(selectGrid)
  const cursor = useSelector(selectCursor)
  
  const isPlayable = useMemo(() => {
    return (r: number, c: number): boolean => {
      if (grid.length === 0) return false
      if (r < 0 || r >= grid.length || c < 0 || c >= grid[0].length) return false
      return grid[r][c] !== 'B'
    }
  }, [grid])
  
  const selectCell = useCallback((r: number, c: number) => {
    if (!isPlayable(r, c)) return
    
    // If clicking same cell, toggle direction
    if (cursor && cursor.r === r && cursor.c === c) {
      dispatch(toggleDirection())
      return
    }
    
    // Determine default direction based on neighboring cells
    const hasLeft = isPlayable(r, c - 1)
    const hasRight = isPlayable(r, c + 1)
    const hasUp = isPlayable(r - 1, c)
    const hasDown = isPlayable(r + 1, c)
    
    const isHorizontal = hasLeft || hasRight
    const isVertical = hasUp || hasDown
    
    let direction: Direction = 'across'
    if (isVertical && !isHorizontal) direction = 'down'
    else if (!isVertical && isHorizontal) direction = 'across'
    // If both directions possible, default to across
    
    dispatch(setCursor({ r, c, direction }))
  }, [cursor, isPlayable, dispatch])
  
  const navigateToClue = useCallback((clueNumber: number, direction: Direction) => {
    if (grid.length === 0) return
    
    // Find the cell with this clue number
    let targetR = -1
    let targetC = -1
    let currentNum = 1
    
    for (let r = 0; r < grid.length; r++) {
      for (let c = 0; c < grid[0].length; c++) {
        if (grid[r][c] === 'N') {
          if (currentNum === clueNumber) {
            targetR = r
            targetC = c
            break
          }
          currentNum++
        }
      }
      if (targetR !== -1) break
    }
    
    if (targetR !== -1 && targetC !== -1) {
      dispatch(setCursor({ r: targetR, c: targetC, direction }))
    }
  }, [grid, dispatch])
  
  return { selectCell, navigateToClue, isPlayable }
}
