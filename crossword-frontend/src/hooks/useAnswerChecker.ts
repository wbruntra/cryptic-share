import { useCallback, useRef } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import {
  setCorrectFlashCells,
  setIncorrectFlashCells,
  clearFlashCells,
  setAttribution,
  setCheckInProgress,
  setCheckResult,
} from '@/store/slices/puzzleSlice'
import { checkSingleWord, extractClueMetadata, checkSessionAnswers } from '@/utils/answerChecker'
import { useAuth } from '@/context/AuthContext'
import { getNickname } from '@/utils/sessionManager'
import axios from 'axios'
import type { AppDispatch, RootState } from '@/store/store'
import type { Direction } from '@/types'

// Selectors
const selectGrid = (state: RootState) => state.puzzle.grid
const selectAnswers = (state: RootState) => state.puzzle.answers
const selectAnswersEncrypted = (state: RootState) => state.puzzle.answersEncrypted
const selectSessionId = (state: RootState) => state.puzzle.sessionId
const selectAttributions = (state: RootState) => state.puzzle.attributions

const FLASH_DURATION_MS = 300

export function useAnswerChecker() {
  const dispatch = useDispatch<AppDispatch>()
  const { user } = useAuth()
  const grid = useSelector(selectGrid)
  const answers = useSelector(selectAnswers)
  const answersEncrypted = useSelector(selectAnswersEncrypted)
  const sessionId = useSelector(selectSessionId)
  const attributions = useSelector(selectAttributions)
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const claimWord = useCallback(
    async (clueNumber: number, direction: Direction) => {
      if (!sessionId) return

      const clueKey = `${clueNumber}-${direction}`

      // Don't claim if already attributed
      if (attributions[clueKey]) return

      const userId = user?.id || null
      const username = user?.username || getNickname() || 'Anonymous'

      try {
        await axios.post(`/api/sessions/${sessionId}/claim`, {
          clueKey,
          userId,
          username,
        })

        // Update local state
        dispatch(
          setAttribution({
            clueKey,
            userId,
            username,
            timestamp: new Date().toISOString(),
          }),
        )
      } catch (error) {
        console.error('[useAnswerChecker] Failed to claim word:', error)
      }
    },
    [sessionId, user, attributions, dispatch],
  )

  const checkCurrentWord = useCallback(
    (
      clueNumber: number,
      direction: Direction,
      answersOverride?: string[],
      onNicknameMissing?: () => void,
    ) => {
      if (!answersEncrypted || grid.length === 0) return

      const effectiveAnswers = answersOverride || answers

      const normalizeEncrypted = (
        value: Record<string, string> | Array<{ number: number; answer: string }>,
      ) => {
        if (Array.isArray(value)) {
          return value
        }
        return Object.entries(value).map(([num, answer]) => ({
          number: parseInt(num, 10),
          answer,
        }))
      }

      const result = checkSingleWord(
        grid,
        effectiveAnswers,
        {
          across: normalizeEncrypted(answersEncrypted.across),
          down: normalizeEncrypted(answersEncrypted.down),
        },
        clueNumber,
        direction,
      )

      if (!result) return

      const cellKeys = result.cells.map((cell) => `${cell.r}-${cell.c}`)

      if (result.isCorrect) {
        dispatch(setCorrectFlashCells(cellKeys))

        // Check for nickname
        const username = user?.username || getNickname()
        if (!username) {
          if (onNicknameMissing) {
            onNicknameMissing()
            return 'nickname_required'
          }
          // Fallback: claim as Anonymous if no callback provided (restore old behavior)
          void claimWord(clueNumber, direction)
        } else {
          void claimWord(clueNumber, direction)
        }
      } else {
        dispatch(setIncorrectFlashCells(cellKeys))
      }

      // Clear flash after duration
      if (flashTimeoutRef.current) {
        clearTimeout(flashTimeoutRef.current)
      }

      flashTimeoutRef.current = setTimeout(() => {
        dispatch(clearFlashCells())
      }, FLASH_DURATION_MS)

      return result.isCorrect ? 'correct' : 'incorrect'
    },
    [grid, answers, answersEncrypted, dispatch, claimWord, user],
  )

  const checkAllAnswers = useCallback(() => {
    console.log('[useAnswerChecker] checkAllAnswers START')

    if (!answersEncrypted || grid.length === 0) {
      console.log('[useAnswerChecker] early return - missing data')
      return
    }

    dispatch(setCheckInProgress(true))

    try {
      const puzzleAnswers = {
        across: Array.isArray(answersEncrypted.across)
          ? answersEncrypted.across
          : Object.entries(answersEncrypted.across).map(([num, answer]) => ({
              number: parseInt(num, 10),
              answer,
            })),
        down: Array.isArray(answersEncrypted.down)
          ? answersEncrypted.down
          : Object.entries(answersEncrypted.down).map(([num, answer]) => ({
              number: parseInt(num, 10),
              answer,
            })),
      }

      console.log('[useAnswerChecker] calling checkSessionAnswers...')
      const { results, totalLetters, filledLetters, errorCells } = checkSessionAnswers(
        grid,
        answers,
        puzzleAnswers,
      )
      console.log('[useAnswerChecker] result:', {
        errorCount: errorCells.length,
        totalChecked: results.length,
      })

      // Check if puzzle is complete (all filled and all correct)
      const isComplete = filledLetters === totalLetters && errorCells.length === 0

      dispatch(
        setCheckResult({
          errorCells,
          totalChecked: results.length,
          isComplete,
        }),
      )
    } catch (err) {
      console.error('[CheckAnswers] Failed:', err)
    } finally {
      dispatch(setCheckInProgress(false))
    }
  }, [answersEncrypted, grid, answers, dispatch])

  const getCurrentClueNumber = useCallback(
    (r: number, c: number, direction: Direction): number | null => {
      if (grid.length === 0) return null

      const metadata = extractClueMetadata(grid)

      // Find the clue that contains this cell
      for (const meta of metadata) {
        if (meta.direction !== direction) continue

        let currR = meta.row
        let currC = meta.col

        // Check if our cell is in this word
        while (currR < grid.length && currC < grid[0].length && grid[currR][currC] !== 'B') {
          if (currR === r && currC === c) {
            return meta.number
          }
          if (direction === 'across') currC++
          else currR++
        }
      }

      return null
    },
    [grid],
  )

  return { checkCurrentWord, getCurrentClueNumber, checkAllAnswers, claimWord }
}
