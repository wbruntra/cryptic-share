import type { RootState } from '@/store/store'

export const selectGrid = (state: RootState) => state.puzzle.grid
export const selectAnswers = (state: RootState) => state.puzzle.answers
export const selectCursor = (state: RootState) => state.puzzle.cursor
export const selectTitle = (state: RootState) => state.puzzle.title
export const selectClues = (state: RootState) => state.puzzle.clues
export const selectChangedCells = (state: RootState) => state.puzzle.changedCells
export const selectShowChangeNotification = (state: RootState) => state.puzzle.showChangeNotification
export const selectCorrectFlashCells = (state: RootState) => state.puzzle.correctFlashCells
export const selectIncorrectFlashCells = (state: RootState) => state.puzzle.incorrectFlashCells
export const selectAttributions = (state: RootState) => state.puzzle.attributions
export const selectSessionId = (state: RootState) => state.puzzle.sessionId
export const selectErrorCells = (state: RootState) => state.puzzle.errorCells
export const selectIsChecking = (state: RootState) => state.puzzle.isChecking
export const selectCheckResult = (state: RootState) => state.puzzle.checkResult
export const selectIsLockModeEnabled = (state: RootState) => state.puzzle.isLockModeEnabled
export const selectIsHintModalOpen = (state: RootState) => state.puzzle.isHintModalOpen
export const selectPuzzleId = (state: RootState) => state.puzzle.puzzleId
