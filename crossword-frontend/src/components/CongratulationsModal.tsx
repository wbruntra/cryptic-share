import { useSelector, useDispatch } from 'react-redux'
import { LuPartyPopper, LuTrophy } from 'react-icons/lu'
import { Modal } from '@/components/Modal'
import { dismissCheckResult } from '@/store/slices/puzzleSlice'
import { selectCheckResult } from '@/store/selectors/puzzleSelectors'
import type { AppDispatch } from '@/store/store'

export function CongratulationsModal() {
  const dispatch = useDispatch<AppDispatch>()
  const checkResult = useSelector(selectCheckResult)

  return (
    <Modal
      isOpen={checkResult.show && checkResult.isComplete}
      onClose={() => dispatch(dismissCheckResult())}
      title={<span className="flex items-center gap-2"><LuPartyPopper size={24} /> Congratulations!</span>}
    >
      <div className="text-center">
        <div className="text-6xl mb-4 animate-bounce text-yellow-500"><LuTrophy size={60} /></div>
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
  )
}
