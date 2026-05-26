import React, { useState } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { LuX, LuLightbulb, LuSearch, LuLock, LuLockOpen, LuBell, LuBellOff } from 'react-icons/lu'
import { CrosswordGrid } from '@/CrosswordGrid'
import { ClueList } from '@/ClueList'
import { AttributionControls } from '@/components/AttributionControls'
import { AttributionStats } from '@/components/AttributionStats'
import { HintModal } from '@/components/HintModal'
import { ChangeNotification } from '@/components/ChangeNotification'
import { CongratulationsModal } from '@/components/CongratulationsModal'
import { Toast } from '@/components/Toast'
import { ToolbarButton } from '@/components/ToolbarButton'
import { Spinner } from '@/components/Spinner'
import {
  clearErrorCells,
  dismissChangeNotification,
  setHintModalOpen,
  toggleLockMode,
} from '@/store/slices/puzzleSlice'
import { useRenderedGrid } from '@/hooks/useGridOptimized'
import { useCurrentClue } from '@/hooks/useCurrentClue'
import { useCheckResultAlert } from '@/hooks/useCheckResultAlert'
import { useNotificationToggle } from '@/hooks/useNotificationToggle'
import { usePuzzleTimer } from '@/hooks/usePuzzleTimer'
import {
  selectTitle,
  selectClues,
  selectCursor,
  selectChangedCells,
  selectShowChangeNotification,
  selectCorrectFlashCells,
  selectIncorrectFlashCells,
  selectAttributions,
  selectSessionId,
  selectErrorCells,
  selectIsChecking,
  selectIsLockModeEnabled,
  selectIsHintModalOpen,
} from '@/store/selectors/puzzleSelectors'

export function DesktopView({
  onClueClick,
  onCellClick,
  onCheckAnswers,
}: {
  onClueClick: (num: number, dir: 'across' | 'down') => void
  onCellClick: (r: number, c: number) => void
  onCheckAnswers: () => void
}) {
  const dispatch = useDispatch()
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
  const isLockModeEnabled = useSelector(selectIsLockModeEnabled)
  const isHintModalOpen = useSelector(selectIsHintModalOpen)
  const [showAttributions, setShowAttributions] = useState(false)

  const { renderedGrid, currentClueNumber } = useRenderedGrid()
  const { clueMetadata, currentClue, currentWordState, handleFetchHintAnswer } =
    useCurrentClue(currentClueNumber)
  const { toastMessage, setToastMessage, handleNotificationClick, isSupported, isSubscribed, isLoading } =
    useNotificationToggle(sessionId)
  useCheckResultAlert()

  const { timerDisplay } = usePuzzleTimer(sessionId ?? undefined)

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 pb-12">
      <ChangeNotification
        show={showChangeNotification}
        onDismiss={() => dispatch(dismissChangeNotification())}
        message="Partner made changes"
      />

      <Toast
        show={!!toastMessage}
        message={toastMessage || ''}
        onDismiss={() => setToastMessage(null)}
      />

      <CongratulationsModal />

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
            <ToolbarButton
              onClick={() => dispatch(clearErrorCells())}
              icon={<LuX size={20} />}
              label="Clear errors"
              className="bg-surface border-border text-text-secondary hover:text-text"
            />
          )}
          <ToolbarButton
            onClick={() => dispatch(setHintModalOpen(true))}
            icon={<LuLightbulb size={20} />}
            label="Get Hint"
            disabled={!cursor || !currentClue}
            className={`bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30 ${!cursor || !currentClue ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-500/20'}`}
          />
          {sessionId && (
            <ToolbarButton
              onClick={() => {
                console.log('[DesktopView] check answers click')
                void onCheckAnswers()
              }}
              icon={isChecking ? <Spinner /> : <LuSearch size={20} />}
              label="Check answers"
              disabled={isChecking}
              className={`bg-yellow-500/10 text-yellow-700 border-yellow-500/30 ${isChecking ? 'opacity-60' : 'hover:bg-yellow-500/20'}`}
            />
          )}
          <ToolbarButton
            onClick={() => dispatch(toggleLockMode())}
            icon={isLockModeEnabled ? <LuLock size={20} /> : <LuLockOpen size={20} />}
            label={isLockModeEnabled ? 'Lock mode enabled' : 'Lock mode disabled'}
            title={isLockModeEnabled ? 'Lock mode: Correct words are locked' : 'Lock mode: All cells editable'}
            className={isLockModeEnabled
              ? 'bg-green-500/10 border-green-500/30 text-green-600 dark:text-green-400'
              : 'bg-surface border-border text-text-secondary hover:border-green-500 hover:text-green-600'}
          />
          {isSupported && sessionId && (
            <ToolbarButton
              onClick={handleNotificationClick}
              icon={isSubscribed ? <LuBell size={20} /> : <LuBellOff size={20} />}
              label={isSubscribed ? 'Unsubscribe from notifications' : 'Subscribe to notifications'}
              title={isSubscribed ? 'Unsubscribe from puzzle notifications' : 'Get notified when words are claimed'}
              disabled={isLoading}
              className={`${isSubscribed
                ? 'bg-primary/10 border-primary text-primary'
                : 'bg-surface border-border text-text-secondary hover:border-primary hover:text-primary'} ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
            />
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

          {clues && <AttributionStats attributions={attributions} clues={clues} />}
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
          timerDisplay={timerDisplay}
        />
      )}
    </div>
  )
}
