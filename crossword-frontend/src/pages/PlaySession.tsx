import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { DesktopView, MobileView } from '@/components/puzzle'
import { NicknameModal } from '@/components/NicknameModal'
import { useIsMobile } from '@/utils/useIsMobile'
import { usePuzzleSync } from '@/hooks/usePuzzleSync'
import { usePuzzleInput } from '@/hooks/usePuzzleInput'
import { useCursorSelection } from '@/hooks/useCursorSelection'
import { useAnswerChecker } from '@/hooks/useAnswerChecker'
import { setNickname } from '@/utils/sessionManager'
import { GameConnectionProvider } from '@/context/GameConnectionContext'
import type { RootState } from '@/store/store'
import type { Direction } from '@/types'

// Selectors
const selectIsLoading = (state: RootState) => state.puzzle.isLoading
const selectError = (state: RootState) => state.puzzle.error
const selectGrid = (state: RootState) => state.puzzle.grid

// Inner component rendered inside GameConnectionProvider so hooks that call
// useGameConnection() (e.g. useAnswerChecker → sendAnswerFeedback) get the
// real context instead of the default no-op.
function PlaySessionInner({ sessionId }: { sessionId: string | undefined }) {
  const isMobile = useIsMobile()

  const [showNicknameModal, setShowNicknameModal] = useState(false)
  const [pendingClaim, setPendingClaim] = useState<{
    clueNumber: number
    direction: Direction
  } | null>(null)

  const isLoading = useSelector(selectIsLoading)
  const error = useSelector(selectError)
  const grid = useSelector(selectGrid)

  const { sendCellUpdate } = usePuzzleSync(sessionId)
  const { checkCurrentWord, checkAllAnswers, claimWord } = useAnswerChecker()
  const { selectCell, navigateToClue } = useCursorSelection()

  const handleCheckAllAnswers = () => {
    console.log('[PlaySession] handleCheckAllAnswers called')
    checkAllAnswers()
  }

  const { onVirtualKeyPress, onVirtualDelete } = usePuzzleInput(
    sendCellUpdate,
    (clueNumber: number, direction: Direction, answersOverride?: string[]) =>
      checkCurrentWord(clueNumber, direction, answersOverride, () => {
        setPendingClaim({ clueNumber, direction })
        setShowNicknameModal(true)
      }),
  )

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
