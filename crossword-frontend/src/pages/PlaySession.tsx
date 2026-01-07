import { useState, useEffect, useMemo, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import axios from 'axios'
import type { CellType, Direction, Clue, PuzzleData } from '../types'
import { ClueList } from '../ClueList'
import { CrosswordGrid } from '../CrosswordGrid'
import { saveLocalSession } from '../utils/sessionManager'
import { useIsMobile } from '../utils/useIsMobile'
import { BottomSheet, FloatingClueBar, MobileClueList } from '../components/mobile'

interface SessionData extends PuzzleData {
  sessionState: string[][] // Array of rows
}

export function PlaySession() {
  const { sessionId } = useParams<{ sessionId: string }>()

  // --- State ---
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [title, setTitle] = useState('')

  // Grid structure (static)
  const [grid, setGrid] = useState<CellType[][]>([])
  const [clues, setClues] = useState<{ across: Clue[]; down: Clue[] } | null>(null)

  // User answers (dynamic)
  const [answers, setAnswers] = useState<string[][]>([])

  // Cursor
  const [cursor, setCursor] = useState<{ r: number; c: number; direction: Direction } | null>(null)

  // Mobile UI state
  const isMobile = useIsMobile()
  const [isClueSheetOpen, setIsClueSheetOpen] = useState(false)

  // --- Data Loading ---
  useEffect(() => {
    if (!sessionId) return

    const fetchSession = async () => {
      setLoading(true)
      try {
        const response = await axios.get<SessionData>(`/api/sessions/${sessionId}`)
        const { title, grid: gridString, clues, sessionState, id: puzzleId } = response.data

        setTitle(title)
        setClues(clues)

        // Update local session timestamp
        saveLocalSession({
          sessionId: sessionId,
          puzzleId: puzzleId,
          puzzleTitle: title,
          lastPlayed: Date.now(),
        })

        // Parse Grid
        const parsedGrid = gridString.split('\n').map((row) => row.trim().split(' ') as CellType[])
        setGrid(parsedGrid)

        // Initialize Answers
        const rows = parsedGrid.length
        const cols = parsedGrid[0].length

        // If sessionState exists and matches dimensions, use it. Otherwise empty.
        if (sessionState && sessionState.length === rows && sessionState[0].length === cols) {
          setAnswers(sessionState)
        } else {
          setAnswers(
            Array(rows)
              .fill(null)
              .map(() => Array(cols).fill('')),
          )
        }
      } catch (error) {
        console.error('Failed to fetch session:', error)
        alert('Failed to load session.')
      } finally {
        setLoading(false)
      }
    }

    fetchSession()
  }, [sessionId])

  // --- Helpers ---
  const isPlayable = (r: number, c: number) => {
    if (grid.length === 0) return false
    if (r < 0 || r >= grid.length || c < 0 || c >= grid[0].length) return false
    return grid[r][c] !== 'B'
  }

  // --- Actions ---
  const handleSave = async () => {
    if (!sessionId) return
    setSaving(true)
    try {
      await axios.put(`/api/sessions/${sessionId}`, {
        state: answers,
      })

      // Also update timestamp locally on save
      // We need puzzleId, which we can get if we store it in state,
      // or we can just update the existing entry without puzzleId if we modify saveLocalSession,
      // but simpler to just store puzzleId in state.
      // Let's assume we can get it from the loaded data.
      // Actually, I didn't save puzzleId in state.
      // I'll skip adding it to state for now and rely on the load update,
      // but ideally "Resume" from home page updates it.
      // Actually, saveLocalSession merges updates, so if we only update timestamp it might be enough if we had a way to just update timestamp by ID.
      // But my saveLocalSession requires the full object or merges...
      // Let's look at saveLocalSession implementation.
      // It merges: sessions[existingIndex] = { ...sessions[existingIndex], ...session, lastPlayed: Date.now() };
      // So I can just pass sessionId and partial data if I wanted, but Typescript might complain.
      // Let's just update the timestamp on load for now, that's sufficient for "Continue Playing" ordering.

      // Optional: visual feedback
    } catch (error) {
      console.error('Failed to save session:', error)
      alert('Failed to save progress.')
    } finally {
      setSaving(false)
    }
  }

  // --- Interaction Logic ---
  const handleCellClick = (r: number, c: number) => {
    if (!isPlayable(r, c)) return

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
      const { r, c, direction } = cursor

      if (e.key.match(/^[a-zA-Z]$/)) {
        const newAnswers = answers.map((row) => [...row])
        newAnswers[r][c] = e.key.toUpperCase()
        setAnswers(newAnswers)
        moveCursor(r, c, direction, 1)
      } else if (e.key === 'Backspace') {
        const currentVal = answers[r][c]
        const newAnswers = answers.map((row) => [...row])
        newAnswers[r][c] = ''
        setAnswers(newAnswers)

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
  }, [cursor, answers, grid, moveCursor])

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

  if (loading) return <div className="loading">Loading session...</div>
  if (!grid.length) return <div className="error">Failed to load puzzle grid.</div>

  // Mobile Layout
  if (isMobile) {
    return (
      <div className="play-session-mobile min-h-screen bg-[var(--bg-color)]">
        {/* Floating clue bar - only when a clue is active */}
        <FloatingClueBar
          clue={currentClue}
          direction={cursor?.direction}
          onTap={() => setIsClueSheetOpen(true)}
        />

        {/* Main content area */}
        <div className="px-2 pb-20" style={{ paddingTop: currentClue ? '60px' : '0' }}>
          {/* Compact header */}
          <div className="flex items-center justify-between py-3 px-2">
            <h1 className="text-lg font-bold text-[var(--text-color)] m-0 truncate flex-1">
              {title}
            </h1>
            <button
              onClick={handleSave}
              disabled={saving}
              className="button button-primary text-sm px-3 py-1.5 shrink-0 ml-2"
            >
              {saving ? '...' : 'Save'}
            </button>
          </div>

          {/* Grid - full width */}
          <div className="bg-[var(--surface-color)] rounded-lg p-2">
            <CrosswordGrid grid={renderedGrid} mode="play" onCellClick={handleCellClick} />
          </div>
        </div>

        {/* FAB to open clues (when no clue selected) */}
        {!currentClue && (
          <button
            onClick={() => setIsClueSheetOpen(true)}
            className="
                            fixed bottom-6 right-6 z-20
                            w-14 h-14 rounded-full
                            bg-[var(--primary-color)] text-white
                            flex items-center justify-center
                            shadow-lg
                            text-2xl
                            border-none cursor-pointer
                            active:scale-95 transition-transform
                        "
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
      </div>
    )
  }

  // Desktop Layout (original)
  return (
    <div className="play-session">
      <header className="session-header">
        <h1>{title}</h1>
      </header>

      <div className="session-controls">
        <button
          onClick={handleSave}
          disabled={saving}
          className="button button-primary save-button"
        >
          {saving ? 'Saving...' : 'Save Progress'}
        </button>
      </div>

      <div className="main-container">
        {clues && (
          <ClueList
            clues={clues}
            currentClueNumber={currentClueNumber}
            currentDirection={cursor?.direction}
            onClueClick={handleClueClick}
          />
        )}

        <div className="card puzzle-container">
          <CrosswordGrid grid={renderedGrid} mode="play" onCellClick={handleCellClick} />
          <div className="instructions">
            <small>
              <strong>Shortcuts:</strong> Arrow keys to move, Tab to switch direction, Backspace to
              delete.
            </small>
          </div>
        </div>
      </div>
    </div>
  )
}
