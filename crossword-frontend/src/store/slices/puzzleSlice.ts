import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { CellType, Direction, Clue } from '@/types'

interface Cursor {
  r: number
  c: number
  direction: Direction
}

export interface PuzzleState {
  // Core data
  grid: CellType[][]
  answers: string[]
  clues: { across: Clue[]; down: Clue[] } | null
  title: string
  sessionId: string | null
  puzzleId: number | null
  answersEncrypted: {
    across: Record<string, string>
    down: Record<string, string>
  } | null
  
  // UI state
  cursor: Cursor | null
  changedCells: string[]
  showChangeNotification: boolean
  correctFlashCells: string[]
  incorrectFlashCells: string[]
  isHintModalOpen: boolean
  errorCells: string[]
  isChecking: boolean
  checkResult: {
    message: string | null
    errorCount: number
    totalChecked: number
    isComplete: boolean
    show: boolean
  }
  
  // Attributions (who solved which word)
  attributions: Record<string, { userId: number | null; username: string; timestamp: string }>
  
  // Meta
  isLoading: boolean
  error: string | null
  lastSyncedAt: number
}

const initialState: PuzzleState = {
  grid: [],
  answers: [],
  clues: null,
  title: '',
  sessionId: null,
  puzzleId: null,
  answersEncrypted: null,
  cursor: null,
  changedCells: [],
  showChangeNotification: false,
  correctFlashCells: [],
  incorrectFlashCells: [],
  isHintModalOpen: false,
  errorCells: [],
  isChecking: false,
  checkResult: {
    message: null,
    errorCount: 0,
    totalChecked: 0,
    isComplete: false,
    show: false
  },
  attributions: {},
  isLoading: false,
  error: null,
  lastSyncedAt: 0,
}

// Helper to normalize state to grid dimensions
function normalizeToGrid(state: string[], rows: number, cols: number): string[] {
  const result: string[] = []
  
  for (let r = 0; r < rows; r++) {
    let row = state[r] || ''
    if (row.length !== cols) {
      row = row.padEnd(cols, ' ').slice(0, cols)
    }
    result.push(row)
  }
  
  return result
}

const puzzleSlice = createSlice({
  name: 'puzzle',
  initialState,
  reducers: {
    loadSessionStart: (state) => {
      state.isLoading = true
      state.error = null
    },
    loadSessionSuccess: (state, action: PayloadAction<{
      grid: string
      clues: { across: Clue[]; down: Clue[] }
      title: string
      sessionState: string[]
      sessionId: string
      puzzleId: number
      answersEncrypted?: {
        across: Record<string, string>
        down: Record<string, string>
      }
      attributions?: Record<string, { userId: number | null; username: string; timestamp: string }>
    }>) => {
      const { grid: gridString, clues, title, sessionState, sessionId, puzzleId, answersEncrypted, attributions } = action.payload
      
      // Parse grid
      const parsedGrid = gridString
        .split('\n')
        .map((row: string) => row.trim().split(' ') as CellType[])
      
      const rows = parsedGrid.length
      const cols = parsedGrid[0]?.length || 0
      
      // Normalize answers
      const normalizedAnswers = sessionState?.length > 0
        ? normalizeToGrid(sessionState, rows, cols)
        : Array(rows).fill(' '.repeat(cols))
      
      state.grid = parsedGrid
      state.clues = clues
      state.title = title
      state.answers = normalizedAnswers
      state.sessionId = sessionId
      state.puzzleId = puzzleId
      state.answersEncrypted = answersEncrypted || null
      state.attributions = attributions || {}
      state.isLoading = false
      state.lastSyncedAt = Date.now()
    },
    loadSessionError: (state, action: PayloadAction<string>) => {
      state.isLoading = false
      state.error = action.payload
    },
    setCursor: (state, action: PayloadAction<Cursor>) => {
      state.cursor = action.payload
    },
    toggleDirection: (state) => {
      if (state.cursor) {
        state.cursor.direction = state.cursor.direction === 'across' ? 'down' : 'across'
      }
    },
    moveCursor: (state, action: PayloadAction<{ direction: Direction; delta: number }>) => {
      if (!state.cursor || state.grid.length === 0) return
      
      const { direction, delta } = action.payload
      let { r, c } = state.cursor

      // Always update direction to match movement intent
      state.cursor.direction = direction
      
      if (direction === 'across') c += delta
      else r += delta
      
      // Find next playable cell
      let loopCount = 0
      while (loopCount < 100) {
        if (r < 0 || r >= state.grid.length || c < 0 || c >= state.grid[0].length) {
          break
        }
        if (state.grid[r][c] !== 'B') {
          state.cursor = { ...state.cursor, r, c, direction }
          return
        }
        if (direction === 'across') c += delta
        else r += delta
        loopCount++
      }
    },
    updateCell: (state, action: PayloadAction<{ r: number; c: number; value: string }>) => {
      const { r, c, value } = action.payload
      if (r >= 0 && r < state.answers.length) {
        const row = state.answers[r] || ''
        state.answers[r] = row.substring(0, c) + value + row.substring(c + 1)
        if (state.errorCells.length > 0) {
          const key = `${r}-${c}`
          state.errorCells = state.errorCells.filter((cell) => cell !== key)
        }
      }
    },
    syncFromServer: (state, action: PayloadAction<string[]>) => {
      const serverState = action.payload
      if (!serverState || state.grid.length === 0) return
      
      const normalizedServer = normalizeToGrid(
        serverState,
        state.grid.length,
        state.grid[0].length
      )
      
      // Find changed cells
      const changedCells: string[] = []
      for (let r = 0; r < normalizedServer.length; r++) {
        const localRow = state.answers[r] || ''
        const serverRow = normalizedServer[r] || ''
        for (let c = 0; c < serverRow.length; c++) {
          if (localRow[c] !== serverRow[c]) {
            changedCells.push(`${r}-${c}`)
          }
        }
      }
      
      state.answers = normalizedServer
      state.changedCells = changedCells
      state.showChangeNotification = changedCells.length > 0
      state.lastSyncedAt = Date.now()
    },
    dismissChangeNotification: (state) => {
      state.changedCells = []
      state.showChangeNotification = false
    },
    addChangedCells: (state, action: PayloadAction<string[]>) => {
      const uniqueChanged = new Set([...state.changedCells, ...action.payload])
      state.changedCells = Array.from(uniqueChanged)
      if (action.payload.length > 0) {
        state.showChangeNotification = true
      }
    },
    setCorrectFlashCells: (state, action: PayloadAction<string[]>) => {
      state.correctFlashCells = action.payload
    },
    setIncorrectFlashCells: (state, action: PayloadAction<string[]>) => {
      state.incorrectFlashCells = action.payload
    },
    clearFlashCells: (state) => {
      state.correctFlashCells = []
      state.incorrectFlashCells = []
    },
    setErrorCells: (state, action: PayloadAction<string[]>) => {
      state.errorCells = action.payload
    },
    clearErrorCells: (state) => {
      state.errorCells = []
    },
    setCheckInProgress: (state, action: PayloadAction<boolean>) => {
      state.isChecking = action.payload
    },
    setCheckResult: (state, action: PayloadAction<{ errorCells: string[]; totalChecked?: number; isComplete?: boolean }>) => {
      const errorCount = action.payload.errorCells.length
      state.errorCells = action.payload.errorCells
      state.checkResult = {
        errorCount,
        totalChecked: action.payload.totalChecked || 0,
        isComplete: action.payload.isComplete || false,
        message: errorCount === 0 ? `Good job! All ${action.payload.totalChecked || 0} checked answers are correct.` : `${errorCount} cells incorrect`,
        show: true
      }
    },
    dismissCheckResult: (state) => {
      state.checkResult.show = false
      state.checkResult.message = null
    },
    setHintModalOpen: (state, action: PayloadAction<boolean>) => {
      state.isHintModalOpen = action.payload
    },
    setAttribution: (state, action: PayloadAction<{
      clueKey: string
      userId: number | null
      username: string
      timestamp: string
    }>) => {
      const { clueKey, userId, username, timestamp } = action.payload
      state.attributions[clueKey] = { userId, username, timestamp }
    },
    clearPuzzle: () => initialState,
  },
})

export const {
  loadSessionStart,
  loadSessionSuccess,
  loadSessionError,
  setCursor,
  toggleDirection,
  moveCursor,
  updateCell,
  syncFromServer,
  dismissChangeNotification,
  setCorrectFlashCells,
  setIncorrectFlashCells,
  clearFlashCells,
  addChangedCells,
  setHintModalOpen,
  setErrorCells,
  clearErrorCells,
  setCheckInProgress,
  setCheckResult,
  dismissCheckResult,
  setAttribution,
  clearPuzzle,
} = puzzleSlice.actions

export default puzzleSlice.reducer
