import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import axios from 'axios'
import type { CellType, Direction, Clue, PuzzleData, PuzzleAnswers } from '@/types'
import {
  saveLocalSession,
  getLocalSessionById,
  getNickname,
  setNickname,
} from '@/utils/sessionManager'
import { useIsMobile } from '@/utils/useIsMobile'
import { useAuth } from '@/context/AuthContext'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import { usePuzzleTimer } from '@/hooks/usePuzzleTimer'
import { useSocket } from '@/context/SocketContext'
import { checkSessionAnswers, checkSingleWord, extractClueMetadata } from '@/utils/answerChecker'

interface SessionData extends PuzzleData {
  sessionState: string[]
  answersEncrypted?: PuzzleAnswers
  attributions?: Record<string, { userId: number | null; username: string; timestamp: string }>
}

export function usePlaySessionState(sessionId: string | undefined) {
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('')

  const { isConnected, socketId, send, on, off } = useSocket()

  const { user } = useAuth()
  const [showNicknameModal, setShowNicknameModal] = useState(false)
  const [userNickname, setUserNickname] = useState<string | null>(null)

  useEffect(() => {
    if (!user) {
      const savedNickname = getNickname()
      if (savedNickname) {
        setUserNickname(savedNickname)
      } else {
        setShowNicknameModal(true)
      }
    } else {
      setUserNickname(user.username)
    }
  }, [user])

  const handleNicknameSubmit = useCallback((nickname: string) => {
    setNickname(nickname)
    setUserNickname(nickname)
    setShowNicknameModal(false)
  }, [])

  const localEditTimestamps = useRef<Map<string, number>>(new Map())
  const GRACE_PERIOD_MS = 2000

  const lastSyncTimeRef = useRef<number>(0)
  const SYNC_DEBOUNCE_MS = 1000

  interface QueuedClaim {
    clueKey: string
    userId: number | null
    username: string
    timestamp: number
  }
  const queuedClaimsRef = useRef<QueuedClaim[]>([])

  const [grid, setGrid] = useState<CellType[][]>([])
  const [clues, setClues] = useState<{ across: Clue[]; down: Clue[] } | null>(null)

  const [answers, setAnswers] = useState<string[]>([])
  const answersRef = useRef<string[]>([])

  useEffect(() => {
    answersRef.current = answers
  }, [answers])

  const normalizeStateToDimensions = (state: string[], rows: number, cols: number) => {
    const next = Array(rows).fill(' '.repeat(cols))

    if (Array.isArray(state)) {
      for (let r = 0; r < Math.min(rows, state.length); r++) {
        if (typeof state[r] === 'string') {
          next[r] = state[r]
        }
      }
    }

    for (let r = 0; r < rows; r++) {
      const row = next[r] ?? ''
      if (row.length !== cols) {
        next[r] = row.padEnd(cols, ' ').slice(0, cols)
      }
    }

    return next
  }

  const normalizeAnswersForGrid = useCallback(
    (state: string[]) => {
      if (grid.length === 0) return state
      return normalizeStateToDimensions(state, grid.length, grid[0].length)
    },
    [grid],
  )

  const mergePreferLocalWithChanges = useCallback(
    (localState: string[], serverState: string[]) => {
      if (!Array.isArray(localState) || localState.length === 0) {
        return { merged: serverState, filledFromServer: new Set<string>() }
      }

      const rows = Math.max(localState.length, serverState.length)
      const merged: string[] = []
      const filledFromServer = new Set<string>()

      for (let r = 0; r < rows; r++) {
        const localRow = localState[r] ?? ''
        const serverRow = serverState[r] ?? ''
        const cols = Math.max(localRow.length, serverRow.length)

        let out = ''
        for (let c = 0; c < cols; c++) {
          const l = localRow[c] ?? ' '
          const s = serverRow[c] ?? ' '

          const localBlank = l === ' ' || l === ''
          const serverBlank = s === ' ' || s === ''

          const next = localBlank && !serverBlank ? s : l
          if (next !== l && localBlank && !serverBlank) {
            filledFromServer.add(`${r}-${c}`)
          }
          out += next
        }
        merged.push(out)
      }

      return { merged, filledFromServer }
    },
    [],
  )

  const [answersEncrypted, setAnswersEncrypted] = useState<PuzzleAnswers | null>(null)

  const [cursor, setCursor] = useState<{ r: number; c: number; direction: Direction } | null>(null)

  const [changedCells, setChangedCells] = useState<Set<string>>(new Set())
  const [showChangeNotification, setShowChangeNotification] = useState(false)

  const isMobile = useIsMobile()
  const [isClueSheetOpen, setIsClueSheetOpen] = useState(false)
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false)
  const [isClueBarHidden, setIsClueBarHidden] = useState(false)

  const {
    isSupported: isPushSupported,
    isSubscribed: isPushSubscribed,
    isDismissed: isPushDismissed,
    subscribe: subscribePush,
    dismiss: dismissPushBanner,
    getEndpoint,
  } = usePushNotifications()

  const [checking, setChecking] = useState(false)
  const [errorCells, setErrorCells] = useState<Set<string>>(new Set())
  const [showSuccessModal, setShowSuccessModal] = useState(false)

  const AUTO_CHECK_ENABLED = true
  const [checkedWords, setCheckedWords] = useState<Set<string>>(new Set())
  const [correctFlashCells, setCorrectFlashCells] = useState<Set<string>>(new Set())
  const [incorrectFlashCells, setIncorrectFlashCells] = useState<Set<string>>(new Set())
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [isHintModalOpen, setIsHintModalOpen] = useState(false)
  const hinting = false

  const formattedTime = usePuzzleTimer(sessionId)

  const [attributions, setAttributions] = useState<
    Record<string, { userId: number | null; username: string; timestamp: string }>
  >({})
  const [showAttributions, setShowAttributions] = useState(false)

  const clueMetadata = useMemo(() => {
    if (grid.length === 0) return []
    return extractClueMetadata(grid)
  }, [grid])

  const currentWordState = useMemo(() => {
    if (!cursor || !grid.length) return []
    const { r, c, direction } = cursor
    let startR = r
    let startC = c
    const cells: string[] = []

    if (direction === 'across') {
      while (startC > 0 && grid[startR][startC - 1] !== 'B') startC--
      let curr = startC
      while (curr < grid[0].length && grid[startR][curr] !== 'B') {
        cells.push(answers[startR] ? answers[startR][curr] : ' ')
        curr++
      }
    } else {
      while (startR > 0 && grid[startR - 1][startC] !== 'B') startR--
      let curr = startR
      while (curr < grid.length && grid[curr][startC] !== 'B') {
        cells.push(answers[curr] ? answers[curr][startC] : ' ')
        curr++
      }
    }
    return cells
  }, [cursor, grid, answers])

  const handleOpenHint = () => {
    if (cursor && currentClue) {
      setIsHintModalOpen(true)
    }
  }

  const handleCheckAnswers = useCallback(() => {
    if (!answersEncrypted || grid.length === 0) {
      console.warn('Cannot check answers: answers not loaded or grid empty')
      return
    }

    setChecking(true)
    try {
      setErrorCells(new Set())
      setCheckedWords(new Set())

      const checkResult = checkSessionAnswers(grid, answers, answersEncrypted)

      if (checkResult.errorCells.length > 0) {
        setErrorCells(new Set(checkResult.errorCells))
      } else if (checkResult.results.length > 0) {
        if (checkResult.filledLetters === checkResult.totalLetters) {
          setShowSuccessModal(true)
        } else {
          alert(`Good job! All ${checkResult.results.length} checked answers are correct.`)
        }
      } else {
        alert('No complete words to check yet. Fill in some answers first!')
      }
    } catch (error) {
      console.error('Error checking answers:', error)
      alert('Failed to check answers')
    } finally {
      setChecking(false)
    }
  }, [answersEncrypted, grid, answers])

  const clearErrors = () => {
    setErrorCells(new Set())
    setCheckedWords(new Set())
  }

  const sendClaim = useCallback(
    async (clueKey: string, userId: number | null, username: string) => {
      if (!sessionId) return false

      if (isConnected) {
        send({
          type: 'claim_word',
          sessionId,
          clueKey,
          userId,
          username,
        })
        return true
      }

      try {
        await axios.post(`/api/sessions/${sessionId}/claim`, {
          clueKey,
          userId,
          username,
        })
        return true
      } catch (error) {
        console.error('Failed to send claim via HTTP:', error)
        return false
      }
    },
    [sessionId, isConnected, send],
  )

  const attributionsRef = useRef(attributions)
  useEffect(() => {
    attributionsRef.current = attributions
  }, [attributions])

  const processQueuedClaims = useCallback(async () => {
    if (queuedClaimsRef.current.length === 0 || !sessionId) return

    const claims = [...queuedClaimsRef.current]
    queuedClaimsRef.current = []

    for (const claim of claims) {
      if (attributionsRef.current[claim.clueKey]) continue

      const success = await sendClaim(claim.clueKey, claim.userId, claim.username)
      if (!success) {
        queuedClaimsRef.current.push(claim)
      }
    }
  }, [sessionId, sendClaim])

  const autoCheckCurrentWord = useCallback(
    async (clueNumber: number, direction: Direction, currentAnswers: string[]) => {
      if (!AUTO_CHECK_ENABLED || !answersEncrypted || grid.length === 0) return

      const wordKey = `${clueNumber}-${direction}`

      if (checkedWords.has(wordKey)) return

      const result = checkSingleWord(grid, currentAnswers, answersEncrypted, clueNumber, direction)

      if (result) {
        const cellKeys = result.cells.map((cell) => `${cell.r}-${cell.c}`)

        if (result.isCorrect) {
          setCorrectFlashCells(new Set(cellKeys))

          if (!attributions[wordKey] && sessionId && userNickname) {
            const userId = user?.id || null
            const success = await sendClaim(wordKey, userId, userNickname)

            if (!success) {
              queuedClaimsRef.current.push({
                clueKey: wordKey,
                userId,
                username: userNickname,
                timestamp: Date.now(),
              })
            }
          }
        } else {
          setIncorrectFlashCells(new Set(cellKeys))
        }

        setCheckedWords((prev) => new Set(prev).add(wordKey))

        if (flashTimeoutRef.current) {
          clearTimeout(flashTimeoutRef.current)
        }

        flashTimeoutRef.current = setTimeout(() => {
          setCorrectFlashCells(new Set())
          setIncorrectFlashCells(new Set())
        }, 300)
      }
    },
    [
      AUTO_CHECK_ENABLED,
      answersEncrypted,
      grid,
      checkedWords,
      attributions,
      sessionId,
      userNickname,
      user,
      sendClaim,
    ],
  )

  useEffect(() => {
    return () => {
      if (flashTimeoutRef.current) {
        clearTimeout(flashTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (isPushSubscribed && sessionId && isConnected) {
      const endpoint = getEndpoint()
      if (endpoint) {
        send({ type: 'link_push_session', sessionId, endpoint })
      }
    }
  }, [isPushSubscribed, sessionId, getEndpoint, isConnected, send])

  useEffect(() => {
    if (!sessionId) return

    const fetchSession = async () => {
      setLoading(true)
      try {
        const response = await axios.get<SessionData>(`/api/sessions/${sessionId}`)
        const {
          title,
          grid: gridString,
          clues,
          sessionState,
          id: puzzleId,
          answersEncrypted,
          attributions: serverAttributions,
        } = response.data

        setTitle(title)
        setClues(clues)

        if (answersEncrypted) {
          setAnswersEncrypted(answersEncrypted)
        }

        if (serverAttributions) {
          setAttributions(serverAttributions)
        }

        const parsedGrid = gridString.split('\n').map((row) => row.trim().split(' ') as CellType[])
        setGrid(parsedGrid)

        const rows = parsedGrid.length
        const cols = parsedGrid[0].length

        if (sessionState && Array.isArray(sessionState) && sessionState.length > 0) {
          const normalizedSessionState = normalizeStateToDimensions(sessionState, rows, cols)
          setAnswers(normalizedSessionState)

          const storedSession = getLocalSessionById(sessionId as string)
          if (storedSession?.lastKnownState) {
            const lastState = storedSession.lastKnownState
            const newChangedCells = new Set<string>()

            for (let r = 0; r < rows; r++) {
              if (!lastState[r]) continue
              for (let c = 0; c < cols; c++) {
                const oldVal = lastState[r][c] || ' '
                const newVal = normalizedSessionState[r][c] || ' '
                if (oldVal !== newVal) {
                  newChangedCells.add(`${r}-${c}`)
                }
              }
            }

            if (newChangedCells.size > 0) {
              setChangedCells(newChangedCells)
              setShowChangeNotification(true)
            }
          }
        } else {
          setAnswers(Array(rows).fill(' '.repeat(cols)))
        }

        const shouldUpdateKnownState =
          !sessionState ||
          (sessionState && !getLocalSessionById(sessionId as string)?.lastKnownState)

        saveLocalSession({
          sessionId: sessionId as string,
          puzzleId: puzzleId,
          puzzleTitle: title,
          lastPlayed: Date.now(),
          ...(shouldUpdateKnownState
            ? {
                lastKnownState: sessionState
                  ? normalizeStateToDimensions(sessionState, rows, cols)
                  : Array(rows).fill(' '.repeat(cols)),
              }
            : {}),
        })
      } catch (error) {
        console.error('Failed to fetch session:', error)
        alert('Failed to load session.')
      } finally {
        setLoading(false)
      }
    }

    fetchSession()
  }, [sessionId])

  useEffect(() => {
    if (!sessionId) return

    const handleConnect = () => {
      send({ type: 'join_session', sessionId, pushEndpoint: getEndpoint() })
      void processQueuedClaims()
    }

    if (isConnected) {
      handleConnect()
    }

    const handlePuzzleUpdated = (payload: { state?: string[] } | string[]) => {
      const newState = Array.isArray(payload) ? payload : payload?.state
      if (!Array.isArray(newState)) {
        console.warn('[PlaySession] puzzle_updated missing state payload:', payload)
        return
      }

      const local = answersRef.current
      const normalizedNew = normalizeAnswersForGrid(newState)
      const normalizedLocal = normalizeAnswersForGrid(local)

      if (JSON.stringify(normalizedNew) === JSON.stringify(normalizedLocal)) {
        return
      }

      const changedFromLocal = new Set<string>()

      for (let r = 0; r < normalizedNew.length; r++) {
        const localRow = normalizedLocal[r] ?? ''
        const serverRow = normalizedNew[r] ?? ''
        for (let c = 0; c < serverRow.length; c++) {
          const l = localRow[c] ?? ' '
          const s = serverRow[c] ?? ' '
          if (l !== s) {
            changedFromLocal.add(`${r}-${c}`)
          }
        }
      }

      if (changedFromLocal.size > 0) {
        setChangedCells((prev) => {
          const next = new Set(prev)
          for (const cell of changedFromLocal) next.add(cell)
          return next
        })
        setShowChangeNotification(true)
      }

      setAnswers(normalizedNew)
    }

    const handleCellUpdated = ({
      r,
      c,
      value,
      senderId,
    }: {
      r: number
      c: number
      value: string
      senderId?: string
    }) => {
      if (senderId === socketId) {
        return
      }

      const cellKey = `${r}-${c}`
      const lastEdit = localEditTimestamps.current.get(cellKey)
      if (lastEdit && Date.now() - lastEdit < GRACE_PERIOD_MS) {
        return
      }

      setAnswers((prev) => {
        const newAnswers = normalizeAnswersForGrid(prev)
        if (newAnswers[r]) {
          const row = newAnswers[r]
          newAnswers[r] = row.substring(0, c) + (value || ' ') + row.substring(c + 1)
        }
        return newAnswers
      })

      setChangedCells((prev) => {
        const newSet = new Set(prev)
        newSet.add(`${r}-${c}`)
        return newSet
      })
      setShowChangeNotification(true)
    }

    const handleWordClaimed = ({
      clueKey,
      userId,
      username,
      timestamp,
    }: {
      clueKey: string
      userId: number | null
      username: string
      timestamp: string
    }) => {
      setAttributions((prev) => ({
        ...prev,
        [clueKey]: { userId, username, timestamp },
      }))
    }

    on('puzzle_updated', handlePuzzleUpdated)
    on('cell_updated', handleCellUpdated)
    on('word_claimed', handleWordClaimed)

    return () => {
      off('puzzle_updated', handlePuzzleUpdated)
      off('cell_updated', handleCellUpdated)
      off('word_claimed', handleWordClaimed)
    }
  }, [
    sessionId,
    isConnected,
    send,
    on,
    off,
    getEndpoint,
    processQueuedClaims,
    normalizeAnswersForGrid,
    socketId,
  ])

  const syncSession = useCallback(async () => {
    if (!sessionId) return

    const now = Date.now()
    if (now - lastSyncTimeRef.current < SYNC_DEBOUNCE_MS) {
      return
    }
    lastSyncTimeRef.current = now

    try {
      const response = await axios.get<SessionData>(`/api/sessions/${sessionId}`)
      const { sessionState } = response.data

      if (sessionState) {
        const normalizedLocal = normalizeAnswersForGrid(answersRef.current)
        const normalizedServer = normalizeAnswersForGrid(sessionState)

        if (JSON.stringify(normalizedLocal) === JSON.stringify(normalizedServer)) {
          return
        }

        const { merged, filledFromServer } = mergePreferLocalWithChanges(
          normalizedLocal,
          normalizedServer,
        )
        const normalizedMerged = normalizeAnswersForGrid(merged)

        if (JSON.stringify(normalizedLocal) === JSON.stringify(normalizedMerged)) {
          return
        }

        if (filledFromServer.size > 0) {
          setChangedCells((prev) => {
            const next = new Set(prev)
            for (const cell of filledFromServer) next.add(cell)
            return next
          })
          setShowChangeNotification(true)
        }

        setAnswers(normalizedMerged)
      }
    } catch (error) {
      console.error('[PlaySession] Sync failed:', error)
    }
  }, [sessionId, mergePreferLocalWithChanges, normalizeAnswersForGrid])

  useEffect(() => {
    const intervalId = setInterval(syncSession, 30000)
    return () => clearInterval(intervalId)
  }, [syncSession])

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void syncSession()
      }
    }

    const handleFocus = () => {
      void syncSession()
    }

    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [syncSession])

  useEffect(() => {
    if (isConnected) {
      void syncSession()
      void processQueuedClaims()
    }
  }, [isConnected, syncSession, processQueuedClaims])

  const isPlayable = (r: number, c: number) => {
    if (grid.length === 0) return false
    if (r < 0 || r >= grid.length || c < 0 || c >= grid[0].length) return false
    return grid[r][c] !== 'B'
  }

  const clearCheckedWordsForCell = useCallback(
    (r: number, c: number) => {
      if (checkedWords.size === 0) return

      const newCheckedWords = new Set(checkedWords)
      let changed = false

      for (const wordKey of checkedWords) {
        const [numberStr, direction] = wordKey.split('-')
        const clueNumber = parseInt(numberStr, 10)

        const metadata = extractClueMetadata(grid)
        const clueMeta = metadata.find(
          (m) => m.number === clueNumber && m.direction === (direction as Direction),
        )

        if (clueMeta) {
          let currR = clueMeta.row
          let currC = clueMeta.col
          let containsCell = false

          while (currR < grid.length && currC < grid[0].length && grid[currR][currC] !== 'B') {
            if (currR === r && currC === c) {
              containsCell = true
              break
            }
            if (direction === 'across') currC++
            else currR++
          }

          if (containsCell) {
            newCheckedWords.delete(wordKey)
            changed = true
          }
        }
      }

      if (changed) {
        setCheckedWords(newCheckedWords)
      }
    },
    [checkedWords, grid],
  )

  const updateLocalState = useCallback(
    (currentAnswers: string[]) => {
      if (!sessionId) return
      saveLocalSession({
        sessionId,
        puzzleId: 0,
        puzzleTitle: title,
        lastPlayed: Date.now(),
        lastKnownState: currentAnswers,
      })
    },
    [sessionId, title],
  )

  const handleCellClick = (r: number, c: number) => {
    if (!isPlayable(r, c)) return

    if (errorCells.size > 0) {
      // intentionally left blank
    }

    setCursor((prev) => {
      if (prev && prev.r === r && prev.c === c) {
        return { ...prev, direction: prev.direction === 'across' ? 'down' : 'across' }
      }

      const hasLeft = isPlayable(r, c - 1)
      const hasRight = isPlayable(r, c + 1)
      const hasUp = isPlayable(r - 1, c)
      const hasDown = isPlayable(r + 1, c)

      const isHorizontal = hasLeft || hasRight
      const isVertical = hasUp || hasDown

      let newDirection: Direction = 'across'
      if (isVertical && !isHorizontal) newDirection = 'down'
      else if (!isVertical && isHorizontal) newDirection = 'across'

      return { r, c, direction: newDirection }
    })

    if (isMobile) {
      setIsKeyboardOpen(true)
    }
  }

  const moveCursor = useCallback(
    (r: number, c: number, dir: Direction, delta: number) => {
      if (grid.length === 0) return

      let nextR = r
      let nextC = c

      if (dir === 'across') nextC += delta
      else nextR += delta

      let loopCount = 0
      while (loopCount < 100) {
        if (nextR < 0 || nextR >= grid.length || nextC < 0 || nextC >= grid[0].length) break

        if (grid[nextR][nextC] !== 'B') {
          setCursor({ r: nextR, c: nextC, direction: dir })
          return
        }

        if (dir === 'across') nextC += delta
        else nextR += delta
        loopCount++
      }
    },
    [grid],
  )

  const { renderedGrid, currentClueNumber, numberMap } = useMemo(() => {
    if (grid.length === 0)
      return { renderedGrid: [], currentClueNumber: null, numberMap: new Map() }

    let currentNumber = 1
    const numberMap = new Map<number, { r: number; c: number }>()

    const renderedGrid = grid.map((row, r) =>
      row.map((cell, c) => {
        let number = null
        if (cell === 'N') {
          number = currentNumber
          numberMap.set(currentNumber, { r, c })
          currentNumber++
        }

        const isSelected = cursor?.r === r && cursor?.c === c
        const isPlayableCell = cell !== 'B'

        let isActiveWord = false
        if (cursor && isPlayableCell) {
          if (cursor.direction === 'across' && r === cursor.r) {
            let startC = cursor.c
            while (startC > 0 && grid[r][startC - 1] !== 'B') startC--
            let endC = cursor.c
            while (endC < grid[0].length - 1 && grid[r][endC + 1] !== 'B') endC++
            if (c >= startC && c <= endC) isActiveWord = true
          } else if (cursor.direction === 'down' && c === cursor.c) {
            let startR = cursor.r
            while (startR > 0 && grid[startR - 1][c] !== 'B') startR--
            let endR = cursor.r
            while (endR < grid.length - 1 && grid[endR + 1][c] !== 'B') endR++
            if (r >= startR && r <= endR) isActiveWord = true
          }
        }

        return {
          type: cell,
          number,
          isSelected,
          isActiveWord,
          answer: answers[r] ? answers[r][c] : '',
        }
      }),
    )

    let currentClueNumber = null
    if (cursor) {
      let r = cursor.r
      let c = cursor.c
      if (cursor.direction === 'across') {
        while (c > 0 && grid[r][c - 1] !== 'B') c--
      } else {
        while (r > 0 && grid[r - 1][c] !== 'B') r--
      }
      if (renderedGrid[r][c].number) {
        currentClueNumber = renderedGrid[r][c].number
      }
    }

    return { renderedGrid, currentClueNumber, numberMap }
  }, [grid, cursor, answers])

  useEffect(() => {
    if (!cursor) return

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable ||
        target.closest('[role="dialog"]') ||
        target.closest('[role="textbox"]')
      ) {
        return
      }

      if (isHintModalOpen) {
        return
      }

      const { r, c, direction } = cursor

      if (e.key.match(/^[a-zA-Z]$/)) {
        const char = e.key.toUpperCase()
        const newAnswers = normalizeAnswersForGrid(answers)
        const row = newAnswers[r] || ' '
        newAnswers[r] = row.substring(0, c) + char + row.substring(c + 1)
        setAnswers(newAnswers)
        localEditTimestamps.current.set(`${r}-${c}`, Date.now())
        updateLocalState(newAnswers)

        send({ type: 'update_cell', sessionId, r, c, value: char })

        if (errorCells.has(`${r}-${c}`)) {
          const newErrors = new Set(errorCells)
          newErrors.delete(`${r}-${c}`)
          setErrorCells(newErrors)
        }

        moveCursor(r, c, direction, 1)

        clearCheckedWordsForCell(r, c)

        let checkR = r
        let checkC = c
        if (direction === 'across') {
          while (checkC > 0 && grid[r][checkC - 1] !== 'B') checkC--
        } else {
          while (checkR > 0 && grid[checkR - 1][c] !== 'B') checkR--
        }
        const startCellNum = renderedGrid[checkR]?.[checkC]?.number
        if (startCellNum) {
          void autoCheckCurrentWord(startCellNum, direction, newAnswers)
        }
      } else if (e.key === 'Backspace') {
        const currentVal = answers[r][c]
        const newAnswers = normalizeAnswersForGrid(answers)
        const row = newAnswers[r] || ' '
        newAnswers[r] = row.substring(0, c) + ' ' + row.substring(c + 1)
        setAnswers(newAnswers)
        localEditTimestamps.current.set(`${r}-${c}`, Date.now())
        updateLocalState(newAnswers)

        send({ type: 'update_cell', sessionId, r, c, value: '' })

        if (errorCells.has(`${r}-${c}`)) {
          const newErrors = new Set(errorCells)
          newErrors.delete(`${r}-${c}`)
          setErrorCells(newErrors)
        }

        clearCheckedWordsForCell(r, c)

        if (currentVal === '') {
          moveCursor(r, c, direction, -1)
        }
      } else if (e.key === 'ArrowUp') {
        moveCursor(r, c, 'down', -1)
      } else if (e.key === 'ArrowDown') {
        moveCursor(r, c, 'down', 1)
      } else if (e.key === 'ArrowLeft') {
        moveCursor(r, c, 'across', -1)
      } else if (e.key === 'ArrowRight') {
        moveCursor(r, c, 'across', 1)
      } else if (e.key === 'Tab') {
        e.preventDefault()
        setCursor((prev) =>
          prev ? { ...prev, direction: prev.direction === 'across' ? 'down' : 'across' } : null,
        )
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    cursor,
    answers,
    grid,
    moveCursor,
    sessionId,
    isHintModalOpen,
    autoCheckCurrentWord,
    clearCheckedWordsForCell,
    errorCells,
    normalizeAnswersForGrid,
    renderedGrid,
    send,
    updateLocalState,
  ])

  const handleVirtualKeyPress = (key: string) => {
    if (!cursor) return
    const { r, c, direction } = cursor
    const newAnswers = normalizeAnswersForGrid(answers)
    const row = newAnswers[r] || ' '
    newAnswers[r] = row.substring(0, c) + key + row.substring(c + 1)
    setAnswers(newAnswers)
    localEditTimestamps.current.set(`${r}-${c}`, Date.now())
    updateLocalState(newAnswers)

    send({ type: 'update_cell', sessionId, r, c, value: key })

    moveCursor(r, c, direction, 1)

    clearCheckedWordsForCell(r, c)

    let checkR = r
    let checkC = c
    if (direction === 'across') {
      while (checkC > 0 && grid[r][checkC - 1] !== 'B') checkC--
    } else {
      while (checkR > 0 && grid[checkR - 1][c] !== 'B') checkR--
    }
    const startCellNum = renderedGrid[checkR]?.[checkC]?.number
    if (startCellNum) {
      void autoCheckCurrentWord(startCellNum, direction, newAnswers)
    }
  }

  const handleVirtualDelete = () => {
    if (!cursor) return
    const { r, c, direction } = cursor
    const currentVal = answers[r][c]
    const newAnswers = normalizeAnswersForGrid(answers)
    const row = newAnswers[r] || ' '
    newAnswers[r] = row.substring(0, c) + ' ' + row.substring(c + 1)
    setAnswers(newAnswers)
    localEditTimestamps.current.set(`${r}-${c}`, Date.now())
    updateLocalState(newAnswers)

    send({ type: 'update_cell', sessionId, r, c, value: '' })

    clearCheckedWordsForCell(r, c)

    if (currentVal === '') {
      moveCursor(r, c, direction, -1)
    }
  }

  const handleDismissChanges = () => {
    setShowChangeNotification(false)
    setChangedCells(new Set())

    saveLocalSession({
      sessionId: sessionId as string,
      puzzleId: 0,
      puzzleTitle: title,
      lastPlayed: Date.now(),
      lastKnownState: answers,
    })
  }

  const handleClueClick = (num: number, dir: Direction) => {
    const pos = numberMap.get(num)
    if (pos) {
      setCursor({ r: pos.r, c: pos.c, direction: dir })
    }
  }

  const handleMobileClueSelect = (num: number, dir: Direction) => {
    handleClueClick(num, dir)
    setIsClueSheetOpen(false)
  }

  const currentClue = useMemo(() => {
    if (!clues || currentClueNumber === null || !cursor?.direction) return null
    const clueList = cursor.direction === 'across' ? clues.across : clues.down
    return clueList.find((c) => c.number === currentClueNumber) || null
  }, [clues, currentClueNumber, cursor?.direction])

  const handleFetchHintAnswer = useCallback(async () => {
    if (!cursor || !currentClueNumber) throw new Error('No active clue')

    const response = await axios.post<{
      success: boolean
      value?: string
      cached?: boolean
      processing?: boolean
      requestId?: string
      message?: string
    }>(`/api/sessions/${sessionId}/hint`, {
      type: 'word',
      target: { number: currentClueNumber, direction: cursor.direction },
      dryRun: true,
    })

    if (response.data.success) {
      return response.data.value || ''
    }
    throw new Error('Hint request failed')
  }, [cursor, currentClueNumber, sessionId])

  useEffect(() => {
    setIsClueBarHidden(false)
  }, [currentClue])

  const viewProps = {
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
    isClueBarHidden,
    setIsClueBarHidden,
    isClueSheetOpen,
    setIsClueSheetOpen,
    isKeyboardOpen,
    setIsKeyboardOpen,
    clues,
    currentClueNumber,
    handleClueClick,
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
    setAttributions,
  }

  return {
    loading,
    grid,
    showNicknameModal,
    handleNicknameSubmit,
    isMobile,
    viewProps,
  }
}
