import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import confetti from 'canvas-confetti'
import { DesktopView, MobileView } from '@/components/puzzle'
import { NicknameModal } from '@/components/NicknameModal'
import { useIsMobile } from '@/utils/useIsMobile'
import { usePuzzleSync } from '@/hooks/usePuzzleSync'
import { usePuzzleInput } from '@/hooks/usePuzzleInput'
import { useCursorSelection } from '@/hooks/useCursorSelection'
import { useAnswerChecker } from '@/hooks/useAnswerChecker'
import { setNickname } from '@/utils/sessionManager'
import { GameConnectionProvider, useGameConnection } from '@/context/GameConnectionContext'
import { setPuzzleComplete } from '@/store/slices/puzzleSlice'
import type { AppDispatch, RootState } from '@/store/store'
import type { Direction } from '@/types'

// Selectors
const selectIsLoading = (state: RootState) => state.puzzle.isLoading
const selectError = (state: RootState) => state.puzzle.error
const selectGrid = (state: RootState) => state.puzzle.grid
const selectPuzzleComplete = (state: RootState) => state.puzzle.puzzleComplete

// Inner component rendered inside GameConnectionProvider so hooks that call
// useGameConnection() (e.g. useAnswerChecker → sendAnswerFeedback) get the
// real context instead of the default no-op.
function PlaySessionInner({ sessionId }: { sessionId: string | undefined }) {
  const isMobile = useIsMobile()
  const dispatch = useDispatch<AppDispatch>()
  const { sendPuzzleComplete } = useGameConnection()

  const [showNicknameModal, setShowNicknameModal] = useState(false)
  const [pendingClaim, setPendingClaim] = useState<{
    clueNumber: number
    direction: Direction
  } | null>(null)
  const [congratsDismissed, setCongratusDismissed] = useState(false)

  const isLoading = useSelector(selectIsLoading)
  const error = useSelector(selectError)
  const grid = useSelector(selectGrid)
  const puzzleComplete = useSelector(selectPuzzleComplete)

  // Modal is visible when puzzle is complete and hasn't been dismissed
  const showCongratsModal = puzzleComplete && !congratsDismissed

  const hasFiredConfettiRef = useRef(false)

  // Fire confetti when puzzle becomes complete (local or remote trigger)
  useEffect(() => {
    if (puzzleComplete && !hasFiredConfettiRef.current) {
      hasFiredConfettiRef.current = true

      // Initial burst
      confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 } })
      // Side cannons
      setTimeout(() => {
        confetti({ particleCount: 60, angle: 60, spread: 55, origin: { x: 0, y: 0.65 } })
        confetti({ particleCount: 60, angle: 120, spread: 55, origin: { x: 1, y: 0.65 } })
      }, 250)
    }
  }, [puzzleComplete])

  const { sendCellUpdate } = usePuzzleSync(sessionId)
  const { checkCurrentWord, checkAllAnswers, checkIsPuzzleComplete, claimWord } = useAnswerChecker()
  const { selectCell, navigateToClue } = useCursorSelection()

  const handleCheckAllAnswers = () => {
    console.log('[PlaySession] handleCheckAllAnswers called')
    checkAllAnswers()
  }

  const handleWordCheck = (
    clueNumber: number,
    direction: Direction,
    answersOverride?: string[],
  ) => {
    const result = checkCurrentWord(clueNumber, direction, answersOverride, () => {
      setPendingClaim({ clueNumber, direction })
      setShowNicknameModal(true)
    })

    // After each correct word, silently check if the whole puzzle is done.
    // Pass answersOverride so the check uses the freshly-typed answers rather
    // than the Redux state, which may not have re-rendered yet.
    if (result === 'correct' && !hasFiredConfettiRef.current) {
      if (checkIsPuzzleComplete(answersOverride)) {
        dispatch(setPuzzleComplete(true))
        if (sessionId) {
          void sendPuzzleComplete(sessionId)
        }
      }
    }
  }

  const { onVirtualKeyPress, onVirtualDelete } = usePuzzleInput(sendCellUpdate, handleWordCheck)

  const handleNicknameSubmit = (nickname: string) => {
    setNickname(nickname)
    setShowNicknameModal(false)
    if (pendingClaim) {
      void claimWord(pendingClaim.clueNumber, pendingClaim.direction)
      setPendingClaim(null)
    }
  }

  if (isLoading && !grid.length) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] text-text-secondary animate-pulse gap-2">
        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
        Loading puzzle...
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] text-error p-8 bg-error/10 rounded-xl">
        {error}
      </div>
    )
  }

  if (!grid.length) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] text-error p-8 bg-error/10 rounded-xl">
        Failed to load puzzle grid.
      </div>
    )
  }

  return (
    <>
      {showNicknameModal && <NicknameModal onSubmit={handleNicknameSubmit} />}

      {showCongratsModal && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-[100] p-4">
          <div className="bg-surface rounded-lg shadow-xl max-w-sm w-full p-8 border border-border text-center">
            <div className="text-5xl mb-4">🎉</div>
            <h2 className="text-2xl font-bold mb-2 text-text">Puzzle Complete!</h2>
            <p className="text-text-secondary mb-6">
              Congratulations — every answer is correct!
            </p>
            <button
              onClick={() => setCongratusDismissed(true)}
              className="bg-primary text-white px-6 py-2 rounded-lg hover:bg-primary-hover transition-colors font-medium"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {isMobile ? (
        <MobileView
          onClueClick={navigateToClue}
          onCellClick={selectCell}
          onVirtualKeyPress={onVirtualKeyPress}
          onVirtualDelete={onVirtualDelete}
          onCheckAnswers={handleCheckAllAnswers}
        />
      ) : (
        <DesktopView
          onClueClick={navigateToClue}
          onCellClick={selectCell}
          onCheckAnswers={handleCheckAllAnswers}
        />
      )}
    </>
  )
}

export function PlaySession() {
  const { sessionId } = useParams<{ sessionId: string }>()

  return (
    <GameConnectionProvider sessionId={sessionId || null}>
      <PlaySessionInner sessionId={sessionId} />
    </GameConnectionProvider>
  )
}
