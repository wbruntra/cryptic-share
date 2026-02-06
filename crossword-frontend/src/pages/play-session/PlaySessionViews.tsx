import type { Dispatch, SetStateAction } from 'react'
import type { CellType, Clue, Direction } from '@/types'
import { ClueList } from '@/ClueList'
import { CrosswordGrid } from '@/CrosswordGrid'
import { AttributionControls } from '@/components/AttributionControls'
import { AttributionStats } from '@/components/AttributionStats'
import { ChangeNotification } from '@/components/ChangeNotification'
import {
  BottomSheet,
  FloatingClueBar,
  MobileClueList,
  VirtualKeyboard,
} from '@/components/mobile'
import { Modal } from '@/components/Modal'
import { HintModal } from '@/components/HintModal'
import type { ClueMetadata } from '@/utils/answerChecker'

interface RenderedCell {
  type: CellType
  number: number | null
  isSelected: boolean
  isActiveWord: boolean
  answer: string
}

type AttributionMap = Record<string, { userId: number | null; username: string; timestamp: string }>

type Cursor = { r: number; c: number; direction: Direction } | null

type SetBoolean = Dispatch<SetStateAction<boolean>>

type SetAttributions = Dispatch<SetStateAction<AttributionMap>>

export interface PlaySessionViewProps {
  title: string
  showChangeNotification: boolean
  handleDismissChanges: () => void
  isPushSupported: boolean
  isPushSubscribed: boolean
  isPushDismissed: boolean
  subscribePush: () => void
  dismissPushBanner: () => void
  currentClue: Clue | null
  cursor: Cursor
  isClueBarHidden: boolean
  setIsClueBarHidden: SetBoolean
  isClueSheetOpen: boolean
  setIsClueSheetOpen: SetBoolean
  isKeyboardOpen: boolean
  setIsKeyboardOpen: SetBoolean
  clues: { across: Clue[]; down: Clue[] } | null
  currentClueNumber: number | null
  handleClueClick: (num: number, dir: Direction) => void
  handleMobileClueSelect: (num: number, dir: Direction) => void
  renderedGrid: RenderedCell[][]
  handleCellClick: (r: number, c: number) => void
  changedCells: Set<string>
  errorCells: Set<string>
  correctFlashCells: Set<string>
  incorrectFlashCells: Set<string>
  attributions: AttributionMap
  showAttributions: boolean
  setShowAttributions: SetBoolean
  clueMetadata: ClueMetadata[]
  clearErrors: () => void
  handleOpenHint: () => void
  hinting: boolean
  handleCheckAnswers: () => void
  checking: boolean
  showSuccessModal: boolean
  setShowSuccessModal: SetBoolean
  handleFetchHintAnswer: () => Promise<string>
  isHintModalOpen: boolean
  setIsHintModalOpen: SetBoolean
  currentWordState: string[]
  sessionId: string | undefined
  formattedTime: string
  handleVirtualKeyPress: (key: string) => void
  handleVirtualDelete: () => void
  setAttributions: SetAttributions
}

export function PlaySessionMobileView({
  title,
  showChangeNotification,
  handleDismissChanges,
  currentClue,
  cursor,
  isClueBarHidden,
  setIsClueBarHidden,
  isClueSheetOpen,
  setIsClueSheetOpen,
  isKeyboardOpen,
  setIsKeyboardOpen,
  clues,
  currentClueNumber,
  handleMobileClueSelect,
  renderedGrid,
  handleCellClick,
  changedCells,
  errorCells,
  correctFlashCells,
  incorrectFlashCells,
  attributions,
  showAttributions,
  setShowAttributions,
  clueMetadata,
  clearErrors,
  handleOpenHint,
  hinting,
  handleCheckAnswers,
  checking,
  showSuccessModal,
  setShowSuccessModal,
  handleFetchHintAnswer,
  isHintModalOpen,
  setIsHintModalOpen,
  currentWordState,
  sessionId,
  formattedTime,
  handleVirtualKeyPress,
  handleVirtualDelete,
}: PlaySessionViewProps) {
  return (
    <div
      className="play-session-mobile bg-bg -mt-8 overflow-x-hidden"
      style={{ minHeight: 'var(--app-height)' }}
    >
      <ChangeNotification show={showChangeNotification} onDismiss={handleDismissChanges} />

      <FloatingClueBar
        clue={isClueBarHidden ? null : currentClue}
        direction={cursor?.direction}
        onTap={() => setIsClueSheetOpen(true)}
        onDismiss={() => setIsClueBarHidden(true)}
      />

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
          <div className="flex items-center gap-2 shrink-0">
            {errorCells.size > 0 && (
              <button
                onClick={clearErrors}
                className="w-9 h-9 flex items-center justify-center rounded-lg bg-surface border border-border text-text-secondary active:bg-input-bg transition-colors"
                aria-label="Clear errors"
              >
                ✕
              </button>
            )}
            <div className="relative">
              <button
                onClick={handleOpenHint}
                disabled={hinting || !cursor || !currentClue}
                className={`w-9 h-9 flex items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30 active:bg-blue-500/20 transition-colors ${
                  hinting || !cursor || !currentClue ? 'opacity-50' : ''
                }`}
                aria-label="Get Hint"
              >
                💡
              </button>
            </div>

            <button
              onClick={handleCheckAnswers}
              disabled={checking}
              className={`w-9 h-9 flex items-center justify-center rounded-lg bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/30 active:bg-yellow-500/20 transition-colors ${
                checking ? 'opacity-50' : ''
              }`}
              aria-label="Check answers"
            >
              {checking ? (
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                '🔍'
              )}
            </button>
          </div>
        </div>

        <div className="bg-surface rounded-xl p-2 shadow-lg border border-border">
          <CrosswordGrid
            grid={renderedGrid}
            mode="play"
            onCellClick={handleCellClick}
            changedCells={changedCells}
            errorCells={errorCells}
            correctFlashCells={correctFlashCells}
            incorrectFlashCells={incorrectFlashCells}
            attributions={attributions}
            showAttributions={showAttributions}
            clueMetadata={clueMetadata}
          />
        </div>

        <div className="px-4 pb-6 pt-4">
          <div className="grid grid-cols-2 gap-4">
            <AttributionControls
              enabled={showAttributions}
              onToggle={() => setShowAttributions(!showAttributions)}
              attributions={attributions}
            />

            <AttributionStats attributions={attributions} clues={clues} />
          </div>
        </div>
      </div>

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

      <BottomSheet isOpen={isClueSheetOpen} onClose={() => setIsClueSheetOpen(false)} title="Clues">
        {clues && (
          <MobileClueList
            clues={clues}
            currentClueNumber={currentClueNumber}
            currentDirection={cursor?.direction}
            onClueSelect={handleMobileClueSelect}
          />
        )}
      </BottomSheet>

      <Modal
        isOpen={showSuccessModal}
        onClose={() => setShowSuccessModal(false)}
        title="🎉 Congratulations!"
      >
        <div className="text-center">
          <div className="text-6xl mb-4 animate-bounce">🏆</div>
          <p className="text-lg text-text mb-6">
            You've solved all the checked answers correctly!
          </p>
          <p className="text-text-secondary mb-8">Great job solving this cryptic crossword.</p>
          <button
            onClick={() => setShowSuccessModal(false)}
            className="px-6 py-3 bg-primary text-white font-bold rounded-lg shadow-lg hover:bg-primary/90 hover:scale-105 transition-all"
          >
            Keep Playing
          </button>
        </div>
      </Modal>

      <VirtualKeyboard
        isOpen={isKeyboardOpen}
        onClose={() => setIsKeyboardOpen(false)}
        onKeyPress={handleVirtualKeyPress}
        onDelete={handleVirtualDelete}
      />

      {currentClue && sessionId && (
        <HintModal
          isOpen={isHintModalOpen}
          onClose={() => setIsHintModalOpen(false)}
          sessionId={sessionId}
          wordLength={currentWordState.length}
          clue={currentClue.clue}
          clueNumber={currentClue.number}
          direction={cursor?.direction}
          currentWordState={currentWordState}
          onFetchAnswer={handleFetchHintAnswer}
          timerDisplay={formattedTime}
        />
      )}
    </div>
  )
}

export function PlaySessionDesktopView({
  title,
  showChangeNotification,
  handleDismissChanges,
  isPushSupported,
  isPushSubscribed,
  isPushDismissed,
  subscribePush,
  dismissPushBanner,
  currentClue,
  cursor,
  clues,
  currentClueNumber,
  handleClueClick,
  renderedGrid,
  handleCellClick,
  changedCells,
  errorCells,
  correctFlashCells,
  incorrectFlashCells,
  attributions,
  showAttributions,
  setShowAttributions,
  clueMetadata,
  clearErrors,
  handleOpenHint,
  hinting,
  handleCheckAnswers,
  checking,
  showSuccessModal,
  setShowSuccessModal,
  handleFetchHintAnswer,
  isHintModalOpen,
  setIsHintModalOpen,
  currentWordState,
  sessionId,
  formattedTime,
}: PlaySessionViewProps) {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 pb-12">
      {/* <ChangeNotification show={showChangeNotification} onDismiss={handleDismissChanges} />

      {isPushSupported && !isPushSubscribed && !isPushDismissed && (
        <div className="mb-6 p-4 bg-primary/10 border border-primary/30 rounded-xl flex items-center justify-between gap-4">
          <span className="text-text">🔔 Get notified when collaborators update this puzzle</span>
          <div className="flex gap-3 shrink-0">
            <button
              onClick={() => subscribePush()}
              className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90"
            >
              Enable Notifications
            </button>
            <button
              onClick={dismissPushBanner}
              className="px-4 py-2 text-text-secondary text-sm hover:text-text"
            >
              Dismiss
            </button>
          </div>
        </div>
      )} */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 bg-surface p-6 rounded-2xl shadow-lg border border-border">
        <div>
          <h1 className="text-3xl font-bold text-text mb-1 italic tracking-tight">{title}</h1>
          <p className="text-text-secondary text-sm">
            Solve the cryptic clues to complete the grid.
          </p>
        </div>
        <div className="flex items-center gap-4 self-end md:self-center">
          <div className="relative">
            <button
              onClick={handleOpenHint}
              disabled={hinting || !cursor || !currentClue}
              className={`px-4 py-2 bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30 rounded-lg hover:bg-blue-500/20 flex items-center gap-2 transition-colors ${
                hinting || !cursor || !currentClue ? 'opacity-50 cursor-wait' : ''
              }`}
            >
              {hinting ? (
                'Loading...'
              ) : (
                <>
                  <span>💡</span> Hint
                </>
              )}
            </button>
          </div>

          <button
            onClick={handleCheckAnswers}
            disabled={checking}
            className={`px-4 py-2 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/30 rounded-lg hover:bg-yellow-500/20 flex items-center gap-2 transition-colors ${
              checking ? 'opacity-50 cursor-wait' : ''
            }`}
          >
            {checking ? (
              'Checking...'
            ) : (
              <>
                <span>🔍</span> Check Answers
              </>
            )}
          </button>
          {errorCells.size > 0 && (
            <button
              onClick={clearErrors}
              className="px-3 py-2 text-text-secondary hover:text-text text-sm"
            >
              Clear Highlights
            </button>
          )}
        </div>
      </header>

      <div className="flex flex-col lg:flex-row gap-8 items-start justify-center">
        <div className="flex flex-col gap-4">
          {clues && (
            <ClueList
              clues={clues}
              currentClueNumber={currentClueNumber}
              currentDirection={cursor?.direction}
              onClueClick={handleClueClick}
            />
          )}

          <AttributionControls
            enabled={showAttributions}
            onToggle={() => setShowAttributions(!showAttributions)}
            attributions={attributions}
          />

          <AttributionStats attributions={attributions} clues={clues} />
        </div>

        <div className="flex-1 w-full bg-surface p-6 md:p-8 rounded-2xl shadow-xl border border-border relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-2 h-full bg-primary opacity-20"></div>
          <CrosswordGrid
            grid={renderedGrid}
            mode="play"
            onCellClick={handleCellClick}
            changedCells={changedCells}
            errorCells={errorCells}
            correctFlashCells={correctFlashCells}
            incorrectFlashCells={incorrectFlashCells}
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
            <div className="text-[10px] uppercase tracking-widest text-text-secondary/50 font-bold">
              Cryptic Share 2026
            </div>
          </div>
        </div>
      </div>

      <Modal
        isOpen={showSuccessModal}
        onClose={() => setShowSuccessModal(false)}
        title="🎉 Congratulations!"
      >
        <div className="text-center">
          <div className="text-6xl mb-4 animate-bounce">🏆</div>
          <p className="text-lg text-text mb-6">
            You've solved all the checked answers correctly!
          </p>
          <p className="text-text-secondary mb-8">Great job solving this cryptic crossword.</p>
          <button
            onClick={() => setShowSuccessModal(false)}
            className="px-6 py-3 bg-primary text-white font-bold rounded-lg shadow-lg hover:bg-primary/90 hover:scale-105 transition-all"
          >
            Keep Playing
          </button>
        </div>
      </Modal>

      {currentClue && sessionId && (
        <HintModal
          isOpen={isHintModalOpen}
          onClose={() => setIsHintModalOpen(false)}
          sessionId={sessionId}
          wordLength={currentWordState.length}
          clue={currentClue.clue}
          clueNumber={currentClue.number}
          direction={cursor?.direction}
          currentWordState={currentWordState}
          onFetchAnswer={handleFetchHintAnswer}
          timerDisplay={formattedTime}
        />
      )}
    </div>
  )
}
