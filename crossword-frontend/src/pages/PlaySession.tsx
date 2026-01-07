import { useState, useEffect, useMemo, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import axios from 'axios'
import type { CellType, Direction, Clue, PuzzleData } from '../types'
import { ClueList } from '../ClueList'
import { CrosswordGrid } from '../CrosswordGrid'

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
    const [clues, setClues] = useState<{across: Clue[], down: Clue[]} | null>(null)
    
    // User answers (dynamic)
    const [answers, setAnswers] = useState<string[][]>([])
    
    // Cursor
    const [cursor, setCursor] = useState<{r: number, c: number, direction: Direction} | null>(null)

    // --- Data Loading ---
    useEffect(() => {
        if (!sessionId) return

        const fetchSession = async () => {
            setLoading(true)
            try {
                const response = await axios.get<SessionData>(`/api/sessions/${sessionId}`)
                const { title, grid: gridString, clues, sessionState } = response.data
                
                setTitle(title)
                setClues(clues)

                // Parse Grid
                const parsedGrid = gridString.split('\n').map(row => 
                  row.trim().split(' ') as CellType[]
                )
                setGrid(parsedGrid)

                // Initialize Answers
                const rows = parsedGrid.length
                const cols = parsedGrid[0].length
                
                // If sessionState exists and matches dimensions, use it. Otherwise empty.
                if (sessionState && sessionState.length === rows && sessionState[0].length === cols) {
                    setAnswers(sessionState)
                } else {
                    setAnswers(Array(rows).fill(null).map(() => Array(cols).fill('')))
                }

            } catch (error) {
                console.error("Failed to fetch session:", error)
                alert("Failed to load session.")
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
                state: answers
            })
            // Optional: visual feedback
        } catch (error) {
            console.error("Failed to save session:", error)
            alert("Failed to save progress.")
        } finally {
            setSaving(false)
        }
    }

    // --- Interaction Logic ---
    const handleCellClick = (r: number, c: number) => {
        if (!isPlayable(r, c)) return

        setCursor(prev => {
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

    const moveCursor = useCallback((r: number, c: number, dir: Direction, delta: number) => {
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
    }, [grid])

    useEffect(() => {
        if (!cursor) return
    
        const handleKeyDown = (e: KeyboardEvent) => {
          const { r, c, direction } = cursor
    
          if (e.key.match(/^[a-zA-Z]$/)) {
            const newAnswers = answers.map(row => [...row])
            newAnswers[r][c] = e.key.toUpperCase()
            setAnswers(newAnswers)
            moveCursor(r, c, direction, 1)
          } else if (e.key === 'Backspace') {
            const currentVal = answers[r][c]
            const newAnswers = answers.map(row => [...row])
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
              setCursor(prev => prev ? { ...prev, direction: prev.direction === 'across' ? 'down' : 'across' } : null)
          }
        }
    
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
      }, [cursor, answers, grid, moveCursor])

    // --- Render Preparation ---
    const { renderedGrid, currentClueNumber, numberMap } = useMemo(() => {
        if (grid.length === 0) return { renderedGrid: [], currentClueNumber: null, numberMap: new Map() }
    
        let currentNumber = 1
        const numberMap = new Map<number, {r: number, c: number}>()
    
        const renderedGrid = grid.map((row, r) => 
          row.map((cell, c) => {
            let number = null
            if (cell === 'N') {
              number = currentNumber
              numberMap.set(currentNumber, {r, c})
              currentNumber++
            }
            
            const isSelected = cursor?.r === r && cursor?.c === c
            const isPlayableCell = cell !== 'B'
            
            let isActiveWord = false
            if (cursor && isPlayableCell) {
              if (cursor.direction === 'across' && r === cursor.r) {
                 let startC = cursor.c
                 while(startC > 0 && grid[r][startC-1] !== 'B') startC--
                 let endC = cursor.c
                 while(endC < grid[0].length - 1 && grid[r][endC+1] !== 'B') endC++
                 if (c >= startC && c <= endC) isActiveWord = true
    
              } else if (cursor.direction === 'down' && c === cursor.c) {
                 let startR = cursor.r
                 while(startR > 0 && grid[startR-1][c] !== 'B') startR--
                 let endR = cursor.r
                 while(endR < grid.length - 1 && grid[endR+1][c] !== 'B') endR++
                 if (r >= startR && r <= endR) isActiveWord = true
              }
            }
    
            return { 
              type: cell, 
              number, 
              isSelected,
              isActiveWord,
              answer: answers[r] ? answers[r][c] : ''
            }
          })
        )

        // Determine current clue number
        let currentClueNumber = null
        if (cursor) {
            let r = cursor.r
            let c = cursor.c
            if (cursor.direction === 'across') {
                 while(c > 0 && grid[r][c-1] !== 'B') c--
            } else {
                 while(r > 0 && grid[r-1][c] !== 'B') r--
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

    if (loading) return <div className="loading">Loading session...</div>
    if (!grid.length) return <div className="error">Failed to load puzzle grid.</div>

    return (
        <div className="play-session">
            <header className="session-header">
                <Link to="/" className="back-link">← Home</Link>
                <h1>{title}</h1>
                <button 
                    onClick={handleSave} 
                    disabled={saving}
                    className="save-button"
                >
                    {saving ? 'Saving...' : 'Save Progress'}
                </button>
            </header>

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
                    <CrosswordGrid 
                        grid={renderedGrid}
                        mode="play"
                        onCellClick={handleCellClick}
                    />
                    <p className="instructions">Click to select. Type to fill. Arrows to move. Tab to switch direction.</p>
                </div>
            </div>
        </div>
    )
}
