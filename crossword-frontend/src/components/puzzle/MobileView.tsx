import React, { useState, useCallback } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { LuX, LuLightbulb, LuSearch, LuLock, LuLockOpen, LuChartBarBig, LuBell, LuBellOff, LuKeyboard, LuClipboardList } from 'react-icons/lu'
import { CrosswordGrid } from '@/CrosswordGrid'
import { FloatingClueBar, VirtualKeyboard, BottomSheet, MobileClueList } from '@/components/mobile'
import { AttributionControls } from '@/components/AttributionControls'
import { AttributionStats } from '@/components/AttributionStats'
import { HintModal } from '@/components/HintModal'
import { ParsewordsModal } from '@/components/ParsewordsModal'
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
  selectPuzzleId,
} from '@/store/selectors/puzzleSelectors'
import type { Direction } from '@/types'

export function MobileView({
  onClueClick,
  onCellClick,
  onVirtualKeyPress,
  onVirtualDelete,
  onCheckAnswers,
  onFillAnswer,
}: {
  onClueClick: (num: number, dir: Direction) => void
  onCellClick: (r: number, c: number) => void
  onVirtualKeyPress: (key: string) => void
  onVirtualDelete: () => void
  onCheckAnswers: () => void
  onFillAnswer?: (clueNumber: number, direction: 'across' | 'down', answer: string) => void
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

  // Local UI state
  const [isClueSheetOpen, setIsClueSheetOpen] = useState(false)
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false)
  const [isClueBarHidden, setIsClueBarHidden] = useState(false)
  const [showAttributions, setShowAttributions] = useState(false)
  const [showParsewords, setShowParsewords] = useState(false)
  const puzzleId = useSelector(selectPuzzleId)

  const { renderedGrid, currentClueNumber } = useRenderedGrid()
  const { clueMetadata, currentClue, currentWordState, handleFetchHintAnswer } =
    useCurrentClue(currentClueNumber)
  const { toastMessage, setToastMessage, handleNotificationClick, isSupported, isSubscribed, isLoading } =
    useNotificationToggle(sessionId)
  useCheckResultAlert()

  const { timerDisplay } = usePuzzleTimer(sessionId ?? undefined)

  const handleClueSelect = useCallback(
    (num: number, dir: Direction) => {
      setIsClueBarHidden(false)
      onClueClick(num, dir)
      setIsClueSheetOpen(false)
    },
    [onClueClick],
  )

  const handleCellClick = useCallback(
    (r: number, c: number) => {
      setIsClueBarHidden(false)
      onCellClick(r, c)
    },
    [onCellClick],
  )

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

      <Toast
        show={!!toastMessage}
        message={toastMessage || ''}
        onDismiss={() => setToastMessage(null)}
      />

      <CongratulationsModal />

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
              <ToolbarButton
                onClick={() => dispatch(clearErrorCells())}
                icon={<LuX size={18} />}
                label="Clear errors"
                compact
                className="bg-surface border-border text-text-secondary active:bg-input-bg"
              />
            )}
            {sessionId && (
              <ToolbarButton
                onClick={() => dispatch(setHintModalOpen(true))}
                icon={<LuLightbulb size={18} />}
                label="Get Hint"
                disabled={!cursor || !currentClue}
                compact
                className={`bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30 ${!cursor || !currentClue ? 'opacity-50 cursor-not-allowed' : 'active:bg-blue-500/20'}`}
              />
            )}
            {puzzleId && (
              <button
                onClick={() => setShowParsewords(true)}
                className="w-9 h-9 flex items-center justify-center rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/30 active:bg-purple-500/20 transition-colors"
                aria-label="Parsewords puzzles"
                title="Play Parsewords mini-puzzles to discover clue answers"
              >
                🧩
              </button>
            )}
            {sessionId && (
              <ToolbarButton
                onClick={onCheckAnswers}
                icon={isChecking ? <Spinner /> : <LuSearch size={18} />}
                label="Check answers"
                disabled={isChecking}
                compact
                className={`bg-yellow-500/10 text-yellow-700 border-yellow-500/30 ${isChecking ? 'opacity-60' : 'active:bg-yellow-500/20'}`}
              />
            )}
            <ToolbarButton
              onClick={() => dispatch(toggleLockMode())}
              icon={isLockModeEnabled ? <LuLock size={18} /> : <LuLockOpen size={18} />}
              label={isLockModeEnabled ? 'Lock mode enabled' : 'Lock mode disabled'}
              title={isLockModeEnabled ? 'Lock mode: Correct words are locked' : 'Lock mode: All cells editable'}
              compact
              className={isLockModeEnabled
                ? 'bg-green-500/10 border-green-500/30 text-green-600 dark:text-green-400'
                : 'bg-surface border-border text-text-secondary active:border-green-500 active:text-green-600'}
            />
            {sessionId && (
              <ToolbarButton
                onClick={() => setShowAttributions(true)}
                icon={<LuChartBarBig size={18} />}
                label="Show stats"
                compact
                className="bg-surface border-border text-text-secondary active:bg-input-bg"
              />
            )}
            {isSupported && sessionId && (
              <ToolbarButton
                onClick={handleNotificationClick}
                icon={isSubscribed ? <LuBell size={18} /> : <LuBellOff size={18} />}
                label={isSubscribed ? 'Unsubscribe from notifications' : 'Subscribe to notifications'}
                title={isSubscribed ? 'Unsubscribe from puzzle notifications' : 'Get notified when words are claimed'}
                disabled={isLoading}
                compact
                className={`${isSubscribed
                  ? 'bg-primary/10 border-primary text-primary'
                  : 'bg-surface border-border text-text-secondary'} ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
              />
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
          <LuKeyboard size={24} />
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
          <LuClipboardList size={24} />
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

      {puzzleId && (
        <ParsewordsModal
          isOpen={showParsewords}
          onClose={() => setShowParsewords(false)}
          puzzleId={puzzleId}
          onFillAnswer={onFillAnswer}
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
