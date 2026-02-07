import React, { useEffect, useMemo, useState } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { CrosswordGrid } from '@/CrosswordGrid'
import { ClueList } from '@/ClueList'
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
import type { RootState } from '@/store/store'
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
          // Same row - find word boundaries
          let startC = cursor.c
          while (startC > 0 && grid[r][startC - 1] !== 'B') startC--
          let endC = cursor.c
          while (endC < grid[0].length - 1 && grid[r][endC + 1] !== 'B') endC++
          if (c >= startC && c <= endC) isActiveWord = true
        } else if (cursor.direction === 'down' && c === cursor.c) {
          // Same column - find word boundaries
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
    })
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

// Desktop layout
export function DesktopView({
  onClueClick,
  onCellClick,
  onCheckAnswers
}: {
  onClueClick: (num: number, dir: 'across' | 'down') => void
  onCellClick: (r: number, c: number) => void
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
  const [showAttributions, setShowAttributions] = useState(false)
  const isHintModalOpen = useSelector((state: RootState) => state.puzzle.isHintModalOpen)
  const { renderedGrid, currentClueNumber } = useRenderedGrid()


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

  // Show alert for check result (when not complete)
  useEffect(() => {
    if (checkResult.show && !checkResult.isComplete && checkResult.message) {
      window.alert(checkResult.message)
      dispatch(dismissCheckResult())
    }
  }, [checkResult.show, checkResult.isComplete, checkResult.message, dispatch])

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

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 pb-12">
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

      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 bg-surface p-6 rounded-2xl shadow-lg border border-border">
        <div>
          <h1 className="text-3xl font-bold text-text mb-1 italic tracking-tight">{title}</h1>
          <p className="text-text-secondary text-sm">
            Solve the cryptic clues to complete the grid.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {errorCells.length > 0 && (
            <button
              onClick={() => dispatch(clearErrorCells())}
              className="w-10 h-10 flex items-center justify-center rounded-lg bg-surface border border-border text-text-secondary hover:text-text transition-colors"
              aria-label="Clear errors"
            >
              ✕
            </button>
          )}
          <button
            onClick={() => dispatch(setHintModalOpen(true))}
            disabled={!cursor || !currentClue}
            className={`w-10 h-10 flex items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30 transition-colors ${
              !cursor || !currentClue ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-500/20'
            }`}
            aria-label="Get Hint"
          >
            💡
          </button>
          {sessionId && (
            <button
              onClick={() => {
                console.log('[DesktopView] check answers click')
                void onCheckAnswers()
              }}
              className={`w-10 h-10 flex items-center justify-center rounded-lg bg-yellow-500/10 text-yellow-700 border border-yellow-500/30 transition-colors ${
                isChecking ? 'opacity-60' : 'hover:bg-yellow-500/20'
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
        </div>
      </header>


      <div className="flex flex-col lg:flex-row gap-8 items-start justify-center">
        {/* Left sidebar - clues */}
        <div className="flex flex-col gap-4">
          {clues && (
            <ClueList
              clues={clues}
              currentClueNumber={currentClueNumber}
              currentDirection={cursor?.direction}
              onClueClick={onClueClick}
            />
          )}

          <AttributionControls
            enabled={showAttributions}
            onToggle={() => setShowAttributions(!showAttributions)}
            attributions={attributions}
          />

          {clues && (
            <AttributionStats attributions={attributions} clues={clues} />
          )}
        </div>

        {/* Right side - grid */}
        <div className="flex-1 w-full bg-surface p-6 md:p-8 rounded-2xl shadow-xl border border-border">
          <CrosswordGrid
            grid={renderedGrid}
            mode="play"
            onCellClick={onCellClick}
            changedCells={new Set(changedCells)}
            correctFlashCells={new Set(correctFlashCells)}
            incorrectFlashCells={new Set(incorrectFlashCells)}
            errorCells={new Set(errorCells)}
            attributions={attributions}
            showAttributions={showAttributions}
            clueMetadata={clueMetadata}
          />

          <div className="mt-8 pt-6 border-t border-border flex items-center justify-between">
            <div className="flex items-center gap-4 text-xs text-text-secondary font-medium">
              <span className="flex items-center gap-1.5">
                <kbd className="px-1.5 py-0.5 bg-input-bg border border-border rounded text-[10px]">
                  Arrows
                </kbd>{' '}
                Move
              </span>
              <span className="flex items-center gap-1.5">
                <kbd className="px-1.5 py-0.5 bg-input-bg border border-border rounded text-[10px]">
                  Tab
                </kbd>{' '}
                Direction
              </span>
              <span className="flex items-center gap-1.5">
                <kbd className="px-1.5 py-0.5 bg-input-bg border border-border rounded text-[10px]">
                  Back
                </kbd>{' '}
                Clear
              </span>
            </div>
          </div>
        </div>
      </div>

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
        />
      )}
    </div>
  )
}
