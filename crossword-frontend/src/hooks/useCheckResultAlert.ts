import { useEffect } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { dismissCheckResult } from '@/store/slices/puzzleSlice'
import { selectCheckResult } from '@/store/selectors/puzzleSelectors'
import type { AppDispatch } from '@/store/store'

export function useCheckResultAlert() {
  const dispatch = useDispatch<AppDispatch>()
  const checkResult = useSelector(selectCheckResult)

  useEffect(() => {
    if (checkResult.show && !checkResult.isComplete && checkResult.message) {
      window.alert(checkResult.message)
      dispatch(dismissCheckResult())
    }
  }, [checkResult.show, checkResult.isComplete, checkResult.message, dispatch])
}
