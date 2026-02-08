import React, { useEffect, useMemo, useState } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { CrosswordGrid } from '@/CrosswordGrid'
import { FloatingClueBar, VirtualKeyboard, BottomSheet, MobileClueList } from '@/components/mobile'
import { AttributionControls } from '@/components/AttributionControls'
import { AttributionStats } from '@/components/AttributionStats'
import { HintModal } from '@/components/HintModal'
import { ChangeNotification } from '@/components/ChangeNotification'
import { Modal } from '@/components/Modal'
import {
  clearErrorCells,
  dismissChangeNotification,
  setHintModalOpen,
  dismissCheckResult,
} from '@/store/slices/puzzleSlice'
import { extractClueMetadata } from '@/utils/answerChecker'
import { usePuzzleTimer } from '@/hooks/usePuzzleTimer'
import type { RootState } from '@/store/store'
import type { Direction } from '@/types'
import axios from 'axios'

// Selectors
const selectGrid = (state: RootState) => state.puzzle.grid
const selectAnswers = (state: RootState) => state.puzzle.answers
const selectCursor = (state: RootState) => state.puzzle.cursor
const selectTitle = (state: RootState) => state.puzzle.title
const selectClues = (state: RootState) => state.puzzle.clues
const selectChangedCells = (state: RootState) => state.puzzle.changedCells
const selectShowChangeNotification = (state: RootState) => state.puzzle.showChangeNotification
const selectCorrectFlashCells = (state: RootState) => state.puzzle.correctFlashCells
const selectIncorrectFlashCells = (state: RootState) => state.puzzle.incorrectFlashCells
const selectAttributions = (state: RootState) => state.puzzle.attributions
const selectSessionId = (state: RootState) => state.puzzle.sessionId
const selectErrorCells = (state: RootState) => state.puzzle.errorCells
const selectIsChecking = (state: RootState) => state.puzzle.isChecking
const selectCheckResult = (state: RootState) => state.puzzle.checkResult

// Transform grid and answers into rendered cell format
function useRenderedGrid() {
  const grid = useSelector(selectGrid)
  const answers = useSelector(selectAnswers)
  const cursor = useSelector(selectCursor)

  if (grid.length === 0) return { renderedGrid: [], currentClueNumber: null }

  let currentNumber = 1
  const renderedGrid = grid.map((row, r) =>
    row.map((cell, c) => {
      let number = null
      if (cell === 'N') {
        number = currentNumber
        currentNumber++
      }

      const isSelected = cursor?.r === r && cursor?.c === c
      const isPlayableCell = cell !== 'B'

      // Calculate if cell is part of active word
      let isActiveWord = false
      if (cursor && isPlayableCell) {
        if (cursor.direction === 'across' && r === cursor.r) {
          let startC = cursor.c
          while (startC > 0 && grid[r][startC - 1] !== 'B') startC--
          let endC = cursor.c
          while (endC < grid[0].length - 1 && grid[r][endC + 1] !== 'B') endC++
          if (c >= startC && c <= endC) isActiveWord = true
        } else if (cursor.direction === 'down' && c === cursor.c) {
          let startR = cursor.r
          while (startR > 0 && grid[startR - 1][c] !== 'B') startR--
          let endR = cursor.r
          while (endR < grid.length - 1 && grid[endR + 1][c] !== 'B') endR++
          if (r >= startR && r <= endR) isActiveWord = true
        }
      }

      return {
        type: cell,
        number,
        isSelected,
        isActiveWord,
        answer: answers[r]?.[c] || ' ',
      }
    }),
  )

  // Calculate current clue number
  let currentClueNumber = null
  if (cursor) {
    let r = cursor.r
    let c = cursor.c
    if (cursor.direction === 'across') {
      while (c > 0 && grid[r][c - 1] !== 'B') c--
    } else {
      while (r > 0 && grid[r - 1][c] !== 'B') r--
    }
    if (renderedGrid[r]?.[c]?.number) {
      currentClueNumber = renderedGrid[r][c].number
    }
  }

  return { renderedGrid, currentClueNumber }
}

// Mobile layout
export function MobileView({
  onClueClick,
  onCellClick,
  onVirtualKeyPress,
  onVirtualDelete,
  onCheckAnswers,
}: {
  onClueClick: (num: number, dir: Direction) => void
  onCellClick: (r: number, c: number) => void
  onVirtualKeyPress: (key: string) => void
  onVirtualDelete: () => void
  onCheckAnswers: () => void
}) {
  const dispatch = useDispatch()
  const grid = useSelector(selectGrid)
  const answers = useSelector(selectAnswers)
  const title = useSelector(selectTitle)
  const clues = useSelector(selectClues)
  const cursor = useSelector(selectCursor)
  const changedCells = useSelector(selectChangedCells)
  const showChangeNotification = useSelector(selectShowChangeNotification)
  const correctFlashCells = useSelector(selectCorrectFlashCells)
  const incorrectFlashCells = useSelector(selectIncorrectFlashCells)
  const attributions = useSelector(selectAttributions)
  const sessionId = useSelector(selectSessionId)
  const errorCells = useSelector(selectErrorCells)
  const isChecking = useSelector(selectIsChecking)
  const checkResult = useSelector(selectCheckResult)
  const { renderedGrid, currentClueNumber } = useRenderedGrid()

  // Local UI state
  const [isClueSheetOpen, setIsClueSheetOpen] = useState(false)
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false)
  const [isClueBarHidden, setIsClueBarHidden] = useState(false)
  const [showAttributions, setShowAttributions] = useState(false)
  const isHintModalOpen = useSelector((state: RootState) => state.puzzle.isHintModalOpen)
  const timerDisplay = usePuzzleTimer(sessionId || undefined)

  const clueMetadata = useMemo(() => extractClueMetadata(grid), [grid])

  // Get current clue
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
      if (!cursor || !currentClueNumber || !sessionId) {
        throw new Error('No active clue')
      }

      const response = await axios.post<{
        success: boolean
        value?: string
        cached?: boolean
        processing?: boolean
        requestId?: string
        message?: string
      }>(`/api/sessions/${sessionId}/hint`, {
        type: 'word',
        target: { number: currentClueNumber, direction: cursor.direction },
        dryRun: true,
      })

      if (response.data.success) {
        return response.data.value || ''
      }
      throw new Error('Hint request failed')
    }
  }, [cursor, currentClueNumber, sessionId])

  const handleClueSelect = (num: number, dir: Direction) => {
    setIsClueBarHidden(false)
    onClueClick(num, dir)
    setIsClueSheetOpen(false)
  }

  const handleCellClick = (r: number, c: number) => {
    setIsClueBarHidden(false)
    onCellClick(r, c)
  }

  // Show alert for check result (when not complete)
  useEffect(() => {
    if (checkResult.show && !checkResult.isComplete && checkResult.message) {
      window.alert(checkResult.message)
      dispatch(dismissCheckResult())
    }
  }, [checkResult.show, checkResult.isComplete, checkResult.message, dispatch])

  return (
    <div
      className="play-session-mobile bg-bg -mt-8 overflow-x-hidden"
      style={{ minHeight: 'var(--app-height)' }}
    >
      <ChangeNotification
        show={showChangeNotification}
        onDismiss={() => dispatch(dismissChangeNotification())}
        message="Partner made changes"
      />

      {/* Check Result Modal - shown when puzzle is complete */}
      <Modal
        isOpen={checkResult.show && checkResult.isComplete}
        onClose={() => dispatch(dismissCheckResult())}
        title="🎉 Congratulations!"
      >
        <div className="text-center">
          <div className="text-6xl mb-4 animate-bounce">🏆</div>
          <p className="text-lg text-text mb-6">
            You've solved all the checked answers correctly!
          </p>
          <p className="text-text-secondary mb-8">Great job solving this cryptic crossword.</p>
          <button
            onClick={() => dispatch(dismissCheckResult())}
            className="bg-primary hover:bg-primary-hover text-white px-6 py-3 rounded-lg font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </Modal>

      {/* Floating clue bar */}
      <FloatingClueBar
        clue={isClueBarHidden ? null : currentClue}
        direction={cursor?.direction}
        onTap={() => setIsClueSheetOpen(true)}
        onDismiss={() => setIsClueBarHidden(true)}
      />

      {/* Main content */}
      <div
        className="px-2"
        style={{
          paddingBottom: isKeyboardOpen
            ? 'calc(var(--virtual-keyboard-height, 280px) + env(safe-area-inset-bottom))'
            : 'calc(80px + env(safe-area-inset-bottom))',
        }}
      >
        <div className="flex items-center justify-between py-3 px-2 gap-2">
          <h1 className="text-xl font-bold text-text m-0 truncate flex-1">{title}</h1>
          <div className="flex items-center gap-4 shrink-0">
            {errorCells.length > 0 && (
              <button
                onClick={() => dispatch(clearErrorCells())}
                className="w-9 h-9 flex items-center justify-center rounded-lg bg-surface border border-border text-text-secondary active:bg-input-bg transition-colors"
                aria-label="Clear errors"
              >
                ✕
              </button>
            )}
            {sessionId && (
              <button
                onClick={() => dispatch(setHintModalOpen(true))}
                disabled={!cursor || !currentClue}
                className={`w-9 h-9 flex items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30 transition-colors ${
                  !cursor || !currentClue
                    ? 'opacity-50 cursor-not-allowed'
                    : 'active:bg-blue-500/20'
                }`}
                aria-label="Get Hint"
              >
                💡
              </button>
            )}
            {sessionId && (
              <button
                onClick={onCheckAnswers}
                className={`w-9 h-9 flex items-center justify-center rounded-lg bg-yellow-500/10 text-yellow-700 border border-yellow-500/30 transition-colors ${
                  isChecking ? 'opacity-60' : 'active:bg-yellow-500/20'
                }`}
                aria-label="Check answers"
                disabled={isChecking}
              >
                {isChecking ? (
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : (
                  '🔍'
                )}
              </button>
            )}
            {sessionId && (
              <button
                onClick={() => setShowAttributions(true)}
                className="w-9 h-9 flex items-center justify-center rounded-lg bg-surface border border-border text-text-secondary active:bg-input-bg transition-colors"
                aria-label="Show stats"
              >
                📊
              </button>
            )}
          </div>
        </div>

        <div className="bg-surface rounded-xl p-2 shadow-lg border border-border">
          <CrosswordGrid
            grid={renderedGrid}
            mode="play"
            onCellClick={handleCellClick}
            changedCells={new Set(changedCells)}
            correctFlashCells={new Set(correctFlashCells)}
            incorrectFlashCells={new Set(incorrectFlashCells)}
            errorCells={new Set(errorCells)}
            attributions={attributions}
            showAttributions={showAttributions}
            clueMetadata={clueMetadata}
          />
        </div>
      </div>

      {/* Keyboard button */}
      {!isKeyboardOpen && (
        <button
          onClick={() => setIsKeyboardOpen(true)}
          className="fixed right-6 z-20 w-14 h-14 rounded-full bg-surface border border-border text-text flex items-center justify-center shadow-lg text-2xl cursor-pointer active:scale-95 transition-transform"
          style={{ bottom: 'calc(6rem + env(safe-area-inset-bottom))' }}
          aria-label="Open keyboard"
        >
          ⌨️
        </button>
      )}

      {/* Clues button */}
      {(!currentClue || isClueBarHidden) && (
        <button
          onClick={() => setIsClueSheetOpen(true)}
          className="fixed right-6 z-20 w-14 h-14 rounded-full bg-primary text-white flex items-center justify-center shadow-2xl text-2xl border-none cursor-pointer active:scale-95 transition-transform"
          style={{ bottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
          aria-label="Open clues"
        >
          📝
        </button>
      )}

      {/* Clue sheet */}
      <BottomSheet
        isOpen={isClueSheetOpen}
        onClose={() => setIsClueSheetOpen(false)}
        title="Clues"
      >
        {clues && (
          <MobileClueList
            clues={clues}
            currentClueNumber={currentClueNumber}
            currentDirection={cursor?.direction}
            onClueSelect={handleClueSelect}
          />
        )}
      </BottomSheet>

      <BottomSheet
        isOpen={showAttributions}
        onClose={() => setShowAttributions(false)}
        title="Attributions"
        height="45dvh"
      >
        {clues && (
          <div className="space-y-4">
            <AttributionControls
              enabled={showAttributions}
              onToggle={() => setShowAttributions(!showAttributions)}
              attributions={attributions}
            />
            <AttributionStats attributions={attributions} clues={clues} />
          </div>
        )}
      </BottomSheet>

      {sessionId && currentClue && (
        <HintModal
          isOpen={isHintModalOpen}
          onClose={() => dispatch(setHintModalOpen(false))}
          sessionId={sessionId}
          wordLength={currentWordState.length}
          clue={currentClue.clue}
          clueNumber={currentClue.number}
          direction={cursor?.direction}
          currentWordState={currentWordState}
          onFetchAnswer={handleFetchHintAnswer}
          timerDisplay={timerDisplay}
        />
      )}

      {/* Virtual keyboard */}
      <VirtualKeyboard
        isOpen={isKeyboardOpen}
        onClose={() => setIsKeyboardOpen(false)}
        onKeyPress={onVirtualKeyPress}
        onDelete={onVirtualDelete}
      />
    </div>
  )
}
