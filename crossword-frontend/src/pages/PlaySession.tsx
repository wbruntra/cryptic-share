import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useParams } from 'react-router-dom'
import axios from 'axios'
import type { CellType, Direction, Clue, PuzzleData, PuzzleAnswers } from '../types'
import { ClueList } from '../ClueList'
import { CrosswordGrid } from '../CrosswordGrid'
import {
  saveLocalSession,
  getLocalSessionById,
  getNickname,
  setNickname,
  getAnonymousId,
} from '../utils/sessionManager'
import { useIsMobile } from '../utils/useIsMobile'
import { useAuth } from '../context/AuthContext'
import { NicknameModal } from '../components/NicknameModal'
import { AttributionControls } from '../components/AttributionControls'
import { AttributionStats } from '../components/AttributionStats'
import { ChangeNotification } from '../components/ChangeNotification'
import { usePushNotifications } from '../hooks/usePushNotifications'
import {
  BottomSheet,
  FloatingClueBar,
  MobileClueList,
  VirtualKeyboard,
} from '../components/mobile'
import { Modal } from '@/components/Modal'
import { HintModal } from '../components/HintModal'
import { usePuzzleTimer } from '../hooks/usePuzzleTimer'
import { useSocket } from '../context/SocketContext'
import { checkSessionAnswers, checkSingleWord, extractClueMetadata } from '../utils/answerChecker'
import type { ClueMetadata } from '../utils/answerChecker'

interface SessionData extends PuzzleData {
  sessionState: string[] // Array of rows (strings)
  answersEncrypted?: PuzzleAnswers
  attributions?: Record<string, { userId: number | null; username: string; timestamp: string }>
}

export function PlaySession() {
  const { sessionId } = useParams<{ sessionId: string }>()

  // --- State ---
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('')

  // Socket
  const { socket } = useSocket()

  // Auth and Nickname
  const { user } = useAuth()
  const [showNicknameModal, setShowNicknameModal] = useState(false)
  const [userNickname, setUserNickname] = useState<string | null>(null)

  // Check for nickname on mount
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

  const handleNicknameSubmit = (nickname: string) => {
    setNickname(nickname)
    setUserNickname(nickname)
    setShowNicknameModal(false)
  }

  // Local edit timestamps for optimistic locking/grace period
  const localEditTimestamps = useRef<Map<string, number>>(new Map())
  const GRACE_PERIOD_MS = 2000

  // Queue for claims that failed to send (socket not connected, etc.)
  interface QueuedClaim {
    clueKey: string
    userId: number | null
    username: string
    timestamp: number
  }
  const queuedClaimsRef = useRef<QueuedClaim[]>([])

  // Grid structure (static)
  const [grid, setGrid] = useState<CellType[][]>([])
  const [clues, setClues] = useState<{ across: Clue[]; down: Clue[] } | null>(null)

  // User answers (dynamic)
  const [answers, setAnswers] = useState<string[]>([])
  const answersRef = useRef<string[]>([])

  useEffect(() => {
    answersRef.current = answers
  }, [answers])

  const normalizeStateToDimensions = (state: string[], rows: number, cols: number) => {
    const next = state.length === rows ? [...state] : Array(rows).fill(' '.repeat(cols))

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

          // Prefer local when both filled; otherwise fill local blanks from server.
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

  // Encrypted answers for local checking
  const [answersEncrypted, setAnswersEncrypted] = useState<PuzzleAnswers | null>(null)

  // Cursor
  const [cursor, setCursor] = useState<{ r: number; c: number; direction: Direction } | null>(null)

  // Collaboration changes
  const [changedCells, setChangedCells] = useState<Set<string>>(new Set())
  const [showChangeNotification, setShowChangeNotification] = useState(false)

  // Mobile UI state
  const isMobile = useIsMobile()
  const [isClueSheetOpen, setIsClueSheetOpen] = useState(false)
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false)
  const [isClueBarHidden, setIsClueBarHidden] = useState(false)

  // Push notifications
  const {
    isSupported: isPushSupported,
    isSubscribed: isPushSubscribed,
    isDismissed: isPushDismissed,
    subscribe: subscribePush,
    dismiss: dismissPushBanner,
    getEndpoint,
  } = usePushNotifications()

  // Answer Checking
  const [checking, setChecking] = useState(false)
  const [errorCells, setErrorCells] = useState<Set<string>>(new Set())
  const [showSuccessModal, setShowSuccessModal] = useState(false)

  // Auto-Check Feature
  const AUTO_CHECK_ENABLED = true // Future configuration hook point
  const [checkedWords, setCheckedWords] = useState<Set<string>>(new Set()) // Tracks "number-direction" words already auto-checked
  const [correctFlashCells, setCorrectFlashCells] = useState<Set<string>>(new Set())
  const [incorrectFlashCells, setIncorrectFlashCells] = useState<Set<string>>(new Set())
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ... existing imports

  // Hint State
  const [isHintModalOpen, setIsHintModalOpen] = useState(false)
  const [hinting, setHinting] = useState(false)

  // Timer
  const formattedTime = usePuzzleTimer(sessionId)

  // Attributions
  const [attributions, setAttributions] = useState<
    Record<string, { userId: number | null; username: string; timestamp: string }>
  >({})
  const [showAttributions, setShowAttributions] = useState(false)

  // Extract clue metadata for attribution mapping
  const clueMetadata = useMemo(() => {
    if (grid.length === 0) return []
    return extractClueMetadata(grid)
  }, [grid])

  // Calculate current word state for the modal
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
      // Clear previous errors first
      setErrorCells(new Set())
      // Reset auto-check state so words can be re-checked after manual check
      setCheckedWords(new Set())

      // Perform local answer checking
      const checkResult = checkSessionAnswers(grid, answers, answersEncrypted)

      if (checkResult.errorCells.length > 0) {
        setErrorCells(new Set(checkResult.errorCells))
      } else if (checkResult.results.length > 0) {
        // All checked answers are correct
        if (checkResult.filledLetters === checkResult.totalLetters) {
          // Puzzle is entirely filled and checked correct -> Success Modal
          setShowSuccessModal(true)
        } else {
          // Partial success
          alert(`Good job! All ${checkResult.results.length} checked answers are correct.`)
        }
      } else {
        // No complete words to check yet
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
    // Also clear auto-check state when manually clearing errors
    setCheckedWords(new Set())
  }

  // Helper to send a word claim with socket fallback to HTTP
  const sendClaim = useCallback(
    async (clueKey: string, userId: number | null, username: string) => {
      if (!sessionId) return false

      // Try socket first if connected
      if (socket?.connected) {
        socket.emit('claim_word', {
          sessionId,
          clueKey,
          userId,
          username,
        })
        return true
      }

      // Fallback to HTTP
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
    [sessionId, socket],
  )

  // Track attributions in a ref to avoid dependency issues
  const attributionsRef = useRef(attributions)
  useEffect(() => {
    attributionsRef.current = attributions
  }, [attributions])

  // Process any queued claims when socket reconnects
  const processQueuedClaims = useCallback(async () => {
    if (queuedClaimsRef.current.length === 0 || !sessionId) return

    const claims = [...queuedClaimsRef.current]
    queuedClaimsRef.current = []

    for (const claim of claims) {
      // Skip if already claimed by someone else
      if (attributionsRef.current[claim.clueKey]) continue

      const success = await sendClaim(claim.clueKey, claim.userId, claim.username)
      if (!success) {
        // Re-queue if still failing
        queuedClaimsRef.current.push(claim)
      }
    }
  }, [sessionId, sendClaim])

  // Auto-check the current word if it's complete
  // NOTE: currentAnswers must be passed explicitly to avoid stale closure issues
  // (React state updates are async, so `answers` would be outdated if we relied on it)
  const autoCheckCurrentWord = useCallback(
    async (clueNumber: number, direction: Direction, currentAnswers: string[]) => {
      if (!AUTO_CHECK_ENABLED || !answersEncrypted || grid.length === 0) return

      const wordKey = `${clueNumber}-${direction}`

      // Skip if already checked
      if (checkedWords.has(wordKey)) return

      const result = checkSingleWord(grid, currentAnswers, answersEncrypted, clueNumber, direction)

      if (result) {
        // Word is complete - show flash feedback
        const cellKeys = result.cells.map((cell) => `${cell.r}-${cell.c}`)

        if (result.isCorrect) {
          setCorrectFlashCells(new Set(cellKeys))

          // Claim attribution if not already claimed and we have a username
          if (!attributions[wordKey] && sessionId && userNickname) {
            const userId = user?.id || null
            const success = await sendClaim(wordKey, userId, userNickname)

            if (!success) {
              // Queue for retry when socket reconnects
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

        // Mark this word as checked
        setCheckedWords((prev) => new Set(prev).add(wordKey))

        // Clear flash after 300ms
        if (flashTimeoutRef.current) {
          clearTimeout(flashTimeoutRef.current)
        }

        flashTimeoutRef.current = setTimeout(() => {
          setCorrectFlashCells(new Set())
          setIncorrectFlashCells(new Set())
        }, 300)
      }
    },
    [answersEncrypted, grid, checkedWords, attributions, sessionId, userNickname, user, sendClaim],
  )

  // Clear flash on unmount
  useEffect(() => {
    return () => {
      if (flashTimeoutRef.current) {
        clearTimeout(flashTimeoutRef.current)
      }
    }
  }, [])

  // When user subscribes while already on a session page, link this session
  useEffect(() => {
    if (isPushSubscribed && sessionId && socket) {
      const endpoint = getEndpoint()
      if (endpoint) {
        socket.emit('link_push_session', { sessionId, endpoint })
      }
    }
  }, [isPushSubscribed, sessionId, getEndpoint, socket])

  // --- Data Loading & Socket Setup ---
  useEffect(() => {
    if (!sessionId || !socket) return

    // Join session on connect (and reconnect)
    const handleConnect = () => {
      socket.emit('join_session', sessionId, getEndpoint())
      // Process any queued claims from when we were offline
      void processQueuedClaims()
    }

    // If already connected, join immediately
    if (socket.connected) {
      handleConnect()
    }

    // Also listen for connect event (for initial connect and reconnects)
    socket.on('connect', handleConnect)

    const handlePuzzleUpdated = (newState: string[]) => {
      // Server is authoritative for puzzle_updated events.
      // Find cells that differ from current local state for notification.
      const local = answersRef.current
      const changedFromLocal = new Set<string>()

      for (let r = 0; r < newState.length; r++) {
        const localRow = local[r] ?? ''
        const serverRow = newState[r] ?? ''
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

      // Overwrite local state with server state
      setAnswers(normalizeAnswersForGrid(newState))
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
      // Ignore own updates if senderId matches our socket ID
      if (socket && senderId === socket.id) return

      // Check grace period for this cell to avoid overwriting recent local edits
      const cellKey = `${r}-${c}`
      const lastEdit = localEditTimestamps.current.get(cellKey)
      if (lastEdit && Date.now() - lastEdit < GRACE_PERIOD_MS) {
        return
      }

      setAnswers((prev) => {
        const newAnswers = normalizeAnswersForGrid(prev)
        if (newAnswers[r]) {
          // String manipulation
          const row = newAnswers[r]
          newAnswers[r] = row.substring(0, c) + (value || ' ') + row.substring(c + 1)
        }
        return newAnswers
      })

      // Track changes from collaborators
      setChangedCells((prev) => {
        const newSet = new Set(prev)
        newSet.add(`${r}-${c}`)
        return newSet
      })
      setShowChangeNotification(true)
    }

    socket.on('puzzle_updated', handlePuzzleUpdated)
    socket.on('cell_updated', handleCellUpdated)

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

    socket.on('word_claimed', handleWordClaimed)

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

        // Store encrypted answers for local checking
        if (answersEncrypted) {
          setAnswersEncrypted(answersEncrypted)
        }

        // Load attributions from server
        if (serverAttributions) {
          setAttributions(serverAttributions)
        }

        // Update local session timestamp
        // MOVED: logic to below to handle conditional lastKnownState update

        // Parse Grid
        const parsedGrid = gridString.split('\n').map((row) => row.trim().split(' ') as CellType[])
        setGrid(parsedGrid)

        // Initialize Answers
        const rows = parsedGrid.length
        const cols = parsedGrid[0].length

        // If sessionState exists and matches dimensions, use it. Otherwise empty.
        // If sessionState exists and matches dimensions, use it. Otherwise empty.
        if (sessionState && sessionState.length === rows && sessionState[0].length === cols) {
          const normalizedSessionState = normalizeStateToDimensions(sessionState, rows, cols)
          setAnswers(normalizedSessionState)

          // Check for changes since last visit
          const storedSession = getLocalSessionById(sessionId as string)
          if (storedSession?.lastKnownState) {
            const lastState = storedSession.lastKnownState
            const newChangedCells = new Set<string>()

            // Compare states
            for (let r = 0; r < rows; r++) {
              // Only iterate up to the shorter length to avoid errors if dimensions mismatch (though we checked dimensions above)
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

        // Update local session (including current answers as confirmed state for FUTURE visits)
        // If we found changes, we DON'T update lastKnownState yet, so the user has to acknowledge them.
        // If we didn't find changes, we update it.
        const shouldUpdateKnownState =
          !sessionState ||
          (sessionState && !getLocalSessionById(sessionId as string)?.lastKnownState)

        const sessId = sessionId as string
        saveLocalSession({
          sessionId: sessId,
          puzzleId: puzzleId,
          puzzleTitle: title,
          lastPlayed: Date.now(),
          // Only set lastKnownState if it's new or empty, otherwise wait for dismiss
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

    return () => {
      // Clean up listeners, but do NOT disconnect the global socket
      socket.off('connect', handleConnect)
      socket.off('puzzle_updated', handlePuzzleUpdated)
      socket.off('cell_updated', handleCellUpdated)
      socket.off('word_claimed', handleWordClaimed)
    }
  }, [sessionId, socket, getEndpoint, mergePreferLocalWithChanges, processQueuedClaims])

  // --- Polling Backup ---
  const syncSession = useCallback(async () => {
    if (!sessionId) return

    // Check socket status and reconnect if needed
    if (socket && !socket.connected) {
      console.log('[PlaySession] Socket disconnected, attempting reconnect...')
      socket.connect()
    }

    try {
      // Fetch latest state without loading spinner
      const response = await axios.get<SessionData>(`/api/sessions/${sessionId}`)
      const { sessionState } = response.data

      if (sessionState) {
        const local = answersRef.current
        if (JSON.stringify(local) === JSON.stringify(sessionState)) {
          return
        }

        const { merged, filledFromServer } = mergePreferLocalWithChanges(local, sessionState)
        if (JSON.stringify(local) === JSON.stringify(merged)) {
          return
        }

        console.log('[PlaySession] Sync found changes, merging server state.')

        if (filledFromServer.size > 0) {
          setChangedCells((prev) => {
            const next = new Set(prev)
            for (const cell of filledFromServer) next.add(cell)
            return next
          })
          setShowChangeNotification(true)
        }

        setAnswers(normalizeAnswersForGrid(merged))
      }
    } catch (error) {
      console.error('[PlaySession] Sync failed:', error)
    }
  }, [sessionId, socket, mergePreferLocalWithChanges])

  useEffect(() => {
    // Poll periodically as a safety net (does a merge, so it won't clobber local edits).
    // Keep it running even when connected; iOS sleep/wake can silently miss events.
    const intervalId = setInterval(syncSession, 30000)
    return () => clearInterval(intervalId)
  }, [syncSession])

  useEffect(() => {
    // iOS sleep/wake often manifests as visibility/focus changes without clean socket events.
    // When the page becomes active again, do an immediate sync.
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
    if (!socket) return

    const handleConnect = () => {
      void syncSession()
      void processQueuedClaims()
    }

    socket.on('connect', handleConnect)
    return () => {
      socket.off('connect', handleConnect)
    }
  }, [socket, syncSession, processQueuedClaims])

  // --- Helpers ---
  const isPlayable = (r: number, c: number) => {
    if (grid.length === 0) return false
    if (r < 0 || r >= grid.length || c < 0 || c >= grid[0].length) return false
    return grid[r][c] !== 'B'
  }

  // Helper to clear checked status for words containing a specific cell
  const clearCheckedWordsForCell = useCallback(
    (r: number, c: number) => {
      if (checkedWords.size === 0) return

      // Find which clue numbers pass through this cell
      const newCheckedWords = new Set(checkedWords)
      let changed = false

      for (const wordKey of checkedWords) {
        const [numberStr, direction] = wordKey.split('-')
        const clueNumber = parseInt(numberStr, 10)

        // Check if this word contains the cell
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

  // --- Actions ---
  // Save state locally to avoid "partner made changes" on own reload
  const updateLocalState = (currentAnswers: string[]) => {
    if (!sessionId) return
    saveLocalSession({
      sessionId,
      puzzleId: 0, // Not needed for update
      puzzleTitle: title,
      lastPlayed: Date.now(),
      lastKnownState: currentAnswers,
    })
  }

  // --- Auto-save Logic (via Socket) ---
  // REMOVED: Debounced auto-save is replaced by granular updates.

  // --- Interaction Logic ---
  const handleCellClick = (r: number, c: number) => {
    if (!isPlayable(r, c)) return

    // Clear specific error if clicking on it? Or just clear all?
    // Let's clear all errors when user starts interacting to allow retry
    if (errorCells.size > 0) {
      // Optional: only clear if clicking on error cell?
      // if (errorCells.has(`${r}-${c}`)) ...
      // For simplicity, maybe we don't clear on click, only on type?
      // User asked: "anything they got wrong would be marked... until?"
      // Usually good UX to clear when they change it.
    }

    setCursor((prev) => {
      if (prev && prev.r === r && prev.c === c) {
        return { ...prev, direction: prev.direction === 'across' ? 'down' : 'across' }
      }

      // Auto-detect direction
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

  useEffect(() => {
    if (!cursor) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore keyboard events when user is typing in an input field, textarea, or contenteditable
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

      // Also ignore if any modal is open
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

        // Emit granular update
        if (socket) {
          socket.emit('update_cell', { sessionId, r, c, value: char })
        }

        // Clear error for this cell if it exists
        if (errorCells.has(`${r}-${c}`)) {
          const newErrors = new Set(errorCells)
          newErrors.delete(`${r}-${c}`)
          setErrorCells(newErrors)
        }

        moveCursor(r, c, direction, 1)

        // Auto-check: clear checked status for edited cell, then check the word we just completed
        clearCheckedWordsForCell(r, c)

        // Calculate clue number for the cell we just edited (before cursor moved)
        let checkR = r
        let checkC = c
        if (direction === 'across') {
          while (checkC > 0 && grid[r][checkC - 1] !== 'B') checkC--
        } else {
          while (checkR > 0 && grid[checkR - 1][c] !== 'B') checkR--
        }
        // Find the clue number at the start of this word
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

        // Emit granular update
        if (socket) {
          socket.emit('update_cell', { sessionId, r, c, value: '' })
        }

        // Clear error for this cell
        if (errorCells.has(`${r}-${c}`)) {
          const newErrors = new Set(errorCells)
          newErrors.delete(`${r}-${c}`)
          setErrorCells(newErrors)
        }

        // Auto-check: clearing a cell makes words incomplete, so just clear checked status
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
  }, [cursor, answers, grid, moveCursor, sessionId, isHintModalOpen])

  const handleVirtualKeyPress = (key: string) => {
    if (!cursor) return
    const { r, c, direction } = cursor
    const newAnswers = normalizeAnswersForGrid(answers)
    const row = newAnswers[r] || ' '
    newAnswers[r] = row.substring(0, c) + key + row.substring(c + 1)
    setAnswers(newAnswers)
    localEditTimestamps.current.set(`${r}-${c}`, Date.now())
    updateLocalState(newAnswers)

    // Emit granular update
    if (socket) {
      socket.emit('update_cell', { sessionId, r, c, value: key })
    }

    moveCursor(r, c, direction, 1)

    // Auto-check: clear checked status for edited cell, then check the word we just completed
    clearCheckedWordsForCell(r, c)

    // Calculate clue number for the cell we just edited (before cursor moved)
    let checkR = r
    let checkC = c
    if (direction === 'across') {
      while (checkC > 0 && grid[r][checkC - 1] !== 'B') checkC--
    } else {
      while (checkR > 0 && grid[checkR - 1][c] !== 'B') checkR--
    }
    // Find the clue number at the start of this word
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

    // Emit granular update
    if (socket) {
      socket.emit('update_cell', { sessionId, r, c, value: '' })
    }

    // Auto-check: clearing a cell makes words incomplete, so just clear checked status
    clearCheckedWordsForCell(r, c)

    if (currentVal === '') {
      moveCursor(r, c, direction, -1)
    }
  }

  const handleDismissChanges = () => {
    setShowChangeNotification(false)
    setChangedCells(new Set())

    // Update last known state to current answers
    saveLocalSession({
      sessionId: sessionId as string,
      puzzleId: 0, // Id/Title not strictly needed for update if not changing
      puzzleTitle: title,
      lastPlayed: Date.now(),
      lastKnownState: answers,
    })
  }

  // --- Render Preparation ---
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

    // Determine current clue number
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

  const handleClueClick = (num: number, dir: Direction) => {
    const pos = numberMap.get(num)
    if (pos) {
      setCursor({ r: pos.r, c: pos.c, direction: dir })
    }
  }

  // Mobile-specific clue selection handler
  const handleMobileClueSelect = (num: number, dir: Direction) => {
    handleClueClick(num, dir)
    setIsClueSheetOpen(false)
  }

  // Get the current clue object for the floating bar
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
    } else {
      throw new Error('Hint request failed')
    }
  }, [cursor, currentClueNumber, sessionId])

  // Explanation handlers are now managed by Redux in HintModal

  useEffect(() => {
    setIsClueBarHidden(false)
  }, [currentClue])

  if (loading)
    return (
      <div className="flex items-center justify-center min-h-[50vh] text-text-secondary animate-pulse gap-2">
        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
        Loading session...
      </div>
    )

  if (!grid.length)
    return (
      <div className="flex items-center justify-center min-h-[50vh] text-error p-8 bg-error/10 rounded-xl">
        Failed to load puzzle grid.
      </div>
    )

  // Mobile Layout
  if (isMobile) {
    return (
      <div
        className="play-session-mobile bg-bg -mt-8 overflow-x-hidden"
        style={{ minHeight: 'var(--app-height)' }}
      >
        <ChangeNotification show={showChangeNotification} onDismiss={handleDismissChanges} />

        {/* One-time push notification prompt */}
        {/* {isPushSupported && !isPushSubscribed && !isPushDismissed && (
          <div className="mx-4 mb-4 p-3 bg-primary/10 border border-primary/30 rounded-xl flex items-center justify-between gap-3">
            <span className="text-sm text-text">
              🔔 Get notified when collaborators update this puzzle
            </span>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => subscribePush()}
                className="px-3 py-1 bg-primary text-white text-sm rounded-lg hover:bg-primary/90"
              >
                Enable
              </button>
              <button
                onClick={dismissPushBanner}
                className="px-3 py-1 text-text-secondary text-sm hover:text-text"
              >
                ✕
              </button>
            </div>
          </div>
        )} */}
        {/* Floating clue bar - only when a clue is active */}
        <FloatingClueBar
          clue={isClueBarHidden ? null : currentClue}
          direction={cursor?.direction}
          onTap={() => setIsClueSheetOpen(true)}
          onDismiss={() => setIsClueBarHidden(true)}
        />

        {/* Main content area */}
        <div
          className="px-2"
          style={{
            paddingBottom: isKeyboardOpen
              ? 'calc(var(--virtual-keyboard-height, 280px) + env(safe-area-inset-bottom))'
              : 'calc(80px + env(safe-area-inset-bottom))',
          }}
        >
          {/* Compact header */}
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
              {/* Mobile Hint Button */}
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

          {/* Grid - full width */}
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

          {/* Attribution Section - Below grid, visible when keyboard is dismissed */}
          <div className="px-4 pb-6 pt-4">
            <div className="grid grid-cols-2 gap-4">
              {/* Attribution Controls */}
              <AttributionControls
                enabled={showAttributions}
                onToggle={() => setShowAttributions(!showAttributions)}
                attributions={attributions}
              />

              {/* Attribution Stats */}
              <AttributionStats attributions={attributions} clues={clues} />
            </div>
          </div>
        </div>

        {/* Keyboard Toggle FAB (Always visible when keyboard is closed) */}
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

        {/* FAB to open clues (when no clue selected) */}
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

        {/* Bottom sheet with clues */}
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
            socket={socket}
          />
        )}
      </div>
    )
  }

  // Desktop Layout

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 pb-12">
      <ChangeNotification show={showChangeNotification} onDismiss={handleDismissChanges} />

      {/* One-time push notification prompt */}
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
      )}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 bg-surface p-6 rounded-2xl shadow-lg border border-border">
        <div>
          <h1 className="text-3xl font-bold text-text mb-1 italic tracking-tight">{title}</h1>
          <p className="text-text-secondary text-sm">
            Solve the cryptic clues to complete the grid.
          </p>
        </div>
        <div className="flex items-center gap-4 self-end md:self-center">
          {/* Hint Button (Desktop) */}
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

          {/* Check Answers Button */}
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

          {/* Attribution Controls */}
          <AttributionControls
            enabled={showAttributions}
            onToggle={() => setShowAttributions(!showAttributions)}
            attributions={attributions}
          />

          {/* Attribution Stats */}
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
          socket={socket}
        />
      )}

      {showNicknameModal && <NicknameModal onSubmit={handleNicknameSubmit} />}
    </div>
  )
}
