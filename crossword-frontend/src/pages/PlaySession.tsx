import { useParams } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { DesktopView, MobileView } from '@/components/puzzle'
import { useIsMobile } from '@/utils/useIsMobile'
import { usePuzzleSync } from '@/hooks/usePuzzleSync'
import { usePuzzleInput } from '@/hooks/usePuzzleInput'
import { useCursorSelection } from '@/hooks/useCursorSelection'
import { useAnswerChecker } from '@/hooks/useAnswerChecker'
import type { RootState } from '@/store/store'
import type { Direction } from '@/types'

// Selectors
const selectIsLoading = (state: RootState) => state.puzzle.isLoading
const selectError = (state: RootState) => state.puzzle.error
const selectGrid = (state: RootState) => state.puzzle.grid

export function PlaySession() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const isMobile = useIsMobile()

  
  // Redux selectors
  const isLoading = useSelector(selectIsLoading)
  const error = useSelector(selectError)
  const grid = useSelector(selectGrid)
  
  // Setup puzzle sync (socket + periodic)
  const { sendCellUpdate } = usePuzzleSync(sessionId)
  
  // Setup answer checking
  const { checkCurrentWord, checkAllAnswers } = useAnswerChecker()

  // Wrapper to log when checkAllAnswers is called
  const handleCheckAllAnswers = () => {
    console.log('[PlaySession] handleCheckAllAnswers called')
    checkAllAnswers()
  }

  // Setup input handling with answer checking
  const { onVirtualKeyPress, onVirtualDelete } = usePuzzleInput(
    sendCellUpdate,
    (clueNumber: number, direction: Direction, answersOverride?: string[]) =>
      checkCurrentWord(clueNumber, direction, answersOverride)
  )
  
  // Setup cursor selection
  const { selectCell, navigateToClue } = useCursorSelection()

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
