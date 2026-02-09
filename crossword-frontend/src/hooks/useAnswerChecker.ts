import { useCallback, useEffect, useRef } from 'react'
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

const FLASH_DURATION_MS = 500

export function useAnswerChecker() {
  const dispatch = useDispatch<AppDispatch>()
  const { user } = useAuth()
  const grid = useSelector(selectGrid)
  const answers = useSelector(selectAnswers)
  const answersEncrypted = useSelector(selectAnswersEncrypted)
  const sessionId = useSelector(selectSessionId)
  const attributions = useSelector(selectAttributions)
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Refs for stable callbacks
  const gridRef = useRef(grid)
  const answersRef = useRef(answers)
  const answersEncryptedRef = useRef(answersEncrypted)
  const attributionsRef = useRef(attributions)
  const sessionIdRef = useRef(sessionId)
  const userRef = useRef(user)

  // Cleanup on unmount to prevent stuck flash state
  useEffect(() => {
    return () => {
      if (flashTimeoutRef.current) {
        clearTimeout(flashTimeoutRef.current)
      }
      // Ideally we would clear flash cells here too, but dispatch in cleanup
      // can be tricky if the store is already torn down.
      // Instead, relying on the component lifecycle or clearPuzzle()
      // helps, but dispatching here is safer than leaving it stuck.
      dispatch(clearFlashCells())
    }
  }, [dispatch])

  useEffect(() => {
    gridRef.current = grid
    answersRef.current = answers
    answersEncryptedRef.current = answersEncrypted
    attributionsRef.current = attributions
    sessionIdRef.current = sessionId
    userRef.current = user
  }, [grid, answers, answersEncrypted, attributions, sessionId, user])

  const claimWord = useCallback(
    async (clueNumber: number, direction: Direction) => {
      const currentSessionId = sessionIdRef.current
      if (!currentSessionId) return

      const clueKey = `${clueNumber}-${direction}`
      const currentAttributions = attributionsRef.current

      // Don't claim if already attributed
      if (currentAttributions[clueKey]) return

      const currentUser = userRef.current
      const userId = currentUser?.id || null
      const username = currentUser?.username || getNickname() || 'Anonymous'

      try {
        await axios.post(`/api/sessions/${currentSessionId}/claim`, {
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
    [dispatch],
  )

  const checkCurrentWord = useCallback(
    (
      clueNumber: number,
      direction: Direction,
      answersOverride?: string[],
      onNicknameMissing?: () => void,
    ) => {
      const currentGrid = gridRef.current
      const currentAnswers = answersRef.current
      const currentAnswersEncrypted = answersEncryptedRef.current

      if (!currentAnswersEncrypted || currentGrid.length === 0) return

      const effectiveAnswers = answersOverride || currentAnswers

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
        currentGrid,
        effectiveAnswers,
        {
          across: normalizeEncrypted(currentAnswersEncrypted.across),
          down: normalizeEncrypted(currentAnswersEncrypted.down),
        },
        clueNumber,
        direction,
      )

      if (!result) return

      const cellKeys = result.cells.map((cell) => `${cell.r}-${cell.c}`)

      if (result.isCorrect) {
        dispatch(setCorrectFlashCells(cellKeys))

        // Check for nickname
        const currentUser = userRef.current
        const username = currentUser?.username || getNickname()
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
    [dispatch, claimWord],
  )

  const checkAllAnswers = useCallback(() => {
    console.log('[useAnswerChecker] checkAllAnswers START')

    const currentGrid = gridRef.current
    const currentAnswers = answersRef.current
    const currentAnswersEncrypted = answersEncryptedRef.current

    if (!currentAnswersEncrypted || currentGrid.length === 0) {
      console.log('[useAnswerChecker] early return - missing data')
      return
    }

    dispatch(setCheckInProgress(true))

    try {
      const puzzleAnswers = {
        across: Array.isArray(currentAnswersEncrypted.across)
          ? currentAnswersEncrypted.across
          : Object.entries(currentAnswersEncrypted.across).map(([num, answer]) => ({
              number: parseInt(num, 10),
              answer,
            })),
        down: Array.isArray(currentAnswersEncrypted.down)
          ? currentAnswersEncrypted.down
          : Object.entries(currentAnswersEncrypted.down).map(([num, answer]) => ({
              number: parseInt(num, 10),
              answer,
            })),
      }

      console.log('[useAnswerChecker] calling checkSessionAnswers...')
      const { results, totalLetters, filledLetters, errorCells } = checkSessionAnswers(
        currentGrid,
        currentAnswers,
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
  }, [dispatch])

  const getCurrentClueNumber = useCallback(
    (r: number, c: number, direction: Direction): number | null => {
      const currentGrid = gridRef.current
      if (currentGrid.length === 0) return null

      const metadata = extractClueMetadata(currentGrid)

      // Find the clue that contains this cell
      for (const meta of metadata) {
        if (meta.direction !== direction) continue

        let currR = meta.row
        let currC = meta.col

        // Check if our cell is in this word
        while (
          currR < currentGrid.length &&
          currC < currentGrid[0].length &&
          currentGrid[currR][currC] !== 'B'
        ) {
          if (currR === r && currC === c) {
            return meta.number
          }
          if (direction === 'across') currC++
          else currR++
        }
      }

      return null
    },
    [],
  )

  const getSolution = useCallback((clueNumber: number, direction: Direction): string | null => {
    const currentAnswersEncrypted = answersEncryptedRef.current
    if (!currentAnswersEncrypted) return null

    const list =
      direction === 'across' ? currentAnswersEncrypted.across : currentAnswersEncrypted.down

    // Handle both array and object formats of answersEncrypted
    let answerEncrypted: string | undefined

    if (Array.isArray(list)) {
      const entry = list.find((a) => a.number === clueNumber)
      answerEncrypted = entry?.answer
    } else {
      answerEncrypted = (list as Record<string, string>)[clueNumber.toString()]
    }

    if (!answerEncrypted) return null

    // Decrypt ROT13
    const decrypted = answerEncrypted.replace(/[a-zA-Z]/g, (c) => {
      const base = c <= 'Z' ? 65 : 97
      return String.fromCharCode(base + ((c.charCodeAt(0) - base + 13) % 26))
    })

    return decrypted.toUpperCase().replace(/[^A-Z]/g, '')
  }, [])

  return { checkCurrentWord, getCurrentClueNumber, checkAllAnswers, claimWord, getSolution }
}
