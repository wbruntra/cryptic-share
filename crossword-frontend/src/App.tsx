import { useState, useMemo, useEffect, useCallback } from 'react'
import axios from 'axios'
import './App.css'
import type { CellType, Mode, Direction, PuzzleSummary, Clue, PuzzleData } from './types'
import { PuzzleControls } from './PuzzleControls'
import { ClueList } from './ClueList'
import { CrosswordGrid } from './CrosswordGrid'
import { EditOutput } from './EditOutput'
import { CreatePuzzleForm } from './CreatePuzzleForm'

function App() {
  // --- State ---
  const [mode, setMode] = useState<Mode | 'create'>('play')
  
  // Data Fetching State
  const [puzzles, setPuzzles] = useState<PuzzleSummary[]>([])
  const [selectedPuzzleId, setSelectedPuzzleId] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [currentClues, setCurrentClues] = useState<{across: Clue[], down: Clue[]} | null>(null)
  
  // Saving state
  const [saving, setSaving] = useState(false)

  // Grid structure
  const [grid, setGrid] = useState<CellType[][]>([])

  // User answers for Puzzle Mode
  const [answers, setAnswers] = useState<string[][]>([])

  // Cursor for Puzzle Mode
  const [cursor, setCursor] = useState<{r: number, c: number, direction: Direction} | null>(null)

  // --- Effects ---

  const fetchPuzzles = useCallback(async () => {
    try {
      const response = await axios.get('/api/puzzles')
      setPuzzles(response.data)
      return response.data
    } catch (error) {
      console.error("Failed to fetch puzzles:", error)
      return []
    }
  }, [])

  // 1. Fetch Puzzle List on Mount
  useEffect(() => {
    fetchPuzzles().then((data) => {
        setSelectedPuzzleId(currentId => {
            if (currentId) return currentId
            return data.length > 0 ? data[0].id : null
        })
    })
  }, [fetchPuzzles])

  // 2. Fetch Puzzle Details when selected
  useEffect(() => {
    if (!selectedPuzzleId || mode === 'create') return

    const fetchPuzzleDetails = async () => {
      setLoading(true)
      try {
        const response = await axios.get<PuzzleData>(`/api/puzzles/${selectedPuzzleId}`)
        const { grid: gridString, clues } = response.data
        
        // Parse Grid
        const parsedGrid = gridString.split('\n').map(row => 
          row.trim().split(' ') as CellType[]
        )
        setGrid(parsedGrid)
        setCurrentClues(clues)
        
        // Reset Answers
        const rows = parsedGrid.length
        const cols = parsedGrid[0].length
        setAnswers(Array(rows).fill(null).map(() => Array(cols).fill('')))
        
        // Reset Cursor
        setCursor(null)

      } catch (error) {
        console.error("Failed to fetch puzzle details:", error)
      } finally {
        setLoading(false)
      }
    }
    fetchPuzzleDetails()
  }, [selectedPuzzleId, mode])


  // --- Helpers ---
  const isPlayable = (r: number, c: number) => {
    if (grid.length === 0) return false
    if (r < 0 || r >= grid.length || c < 0 || c >= grid[0].length) return false
    return grid[r][c] !== 'B'
  }

  // --- Actions ---

  const handleCreatePuzzle = async (title: string, gridStr: string, cluesJson: string) => {
      const clues = JSON.parse(cluesJson)
      const response = await axios.post('/api/puzzles', {
          title,
          grid: gridStr,
          clues
      })
      
      await fetchPuzzles()
      setSelectedPuzzleId(response.data.id)
      setMode('play')
  }

  const handleSaveGrid = async () => {
      if (!selectedPuzzleId) return
      setSaving(true)
      try {
          const outputString = grid.map(row => row.join(' ')).join('\n')
          await axios.put(`/api/puzzles/${selectedPuzzleId}`, {
              grid: outputString
          })
          alert('Grid saved successfully!')
      } catch (error) {
          console.error('Failed to save grid:', error)
          alert('Failed to save grid.')
      } finally {
          setSaving(false)
      }
  }

  // --- Logic ---
  
  // Edit Mode Click Handler
  const handleEditClick = (r: number, c: number) => {
    setGrid(prevGrid => {
      const newGrid = [...prevGrid.map(row => [...row])]
      const current = newGrid[r][c]
      let next: CellType = 'N'
      // Cycle: Number -> White -> Black -> Number
      if (current === 'N') next = 'W'
      else if (current === 'W') next = 'B'
      else if (current === 'B') next = 'N'
      
      newGrid[r][c] = next
      return newGrid
    })
  }

  // Puzzle Mode Click Handler
  const handlePlayClick = (r: number, c: number) => {
    if (!isPlayable(r, c)) return

    setCursor(prev => {
      // If clicking same cell, toggle direction
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

      let newDirection: Direction = 'across' // Default

      if (isVertical && !isHorizontal) {
        newDirection = 'down'
      } else if (!isVertical && isHorizontal) {
        newDirection = 'across'
      } 
      // If both are true, default is across.

      return { r, c, direction: newDirection }
    })
  }

  const handleCellClick = (r: number, c: number) => {
    if (mode === 'edit') {
      handleEditClick(r, c)
    } else if (mode === 'play') {
      handlePlayClick(r, c)
    }
  }

  // Keyboard Navigation
  const moveCursor = useCallback((r: number, c: number, dir: Direction, delta: number) => {
    if (grid.length === 0) return

    let nextR = r
    let nextC = c
    
    // Find next playable cell in direction
    if (dir === 'across') {
      nextC += delta
    } else {
      nextR += delta
    }

    let loopCount = 0
    while (loopCount < 100) { // Safety break
        if (nextR < 0 || nextR >= grid.length || nextC < 0 || nextC >= grid[0].length) {
            break; // Out of bounds
        }
        
        if (grid[nextR][nextC] !== 'B') {
            setCursor({ r: nextR, c: nextC, direction: dir })
            return
        }
        
        // It's a black square, keep going
        if (dir === 'across') nextC += delta
        else nextR += delta
        loopCount++
    }
    
  }, [grid])

  useEffect(() => {
    if (mode !== 'play' || !cursor) return

    const handleKeyDown = (e: KeyboardEvent) => {
      const { r, c, direction } = cursor

      if (e.key.match(/^[a-zA-Z]$/)) {
        // Type letter
        const newAnswers = [...answers.map(row => [...row])]
        newAnswers[r][c] = e.key.toUpperCase()
        setAnswers(newAnswers)
        moveCursor(r, c, direction, 1)
      } else if (e.key === 'Backspace') {
        const currentVal = answers[r][c]
        const newAnswers = [...answers.map(row => [...row])]
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
  }, [mode, cursor, answers, grid, moveCursor])


  // --- Render Helpers ---
  const { renderedGrid, outputString, numberMap, currentClueNumber } = useMemo(() => {
    if (grid.length === 0) return { renderedGrid: [], outputString: '', numberMap: new Map(), currentClueNumber: null }

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
        
        // Puzzle Mode Visuals
        const isSelected = mode === 'play' && cursor?.r === r && cursor?.c === c
        const isPlayableCell = cell !== 'B'
        
        // Active word highlighting
        let isActiveWord = false
        if (mode === 'play' && cursor && isPlayableCell) {
          if (cursor.direction === 'across' && r === cursor.r) {
             // Check if connected horizontally
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

    // Find the number for the active word
    let currentClueNumber = null
    if (mode === 'play' && cursor) {
        let r = cursor.r
        let c = cursor.c
        // Backtrack to find the start of the word
        if (cursor.direction === 'across') {
             while(c > 0 && grid[r][c-1] !== 'B') c--
        } else {
             while(r > 0 && grid[r-1][c] !== 'B') r--
        }
        // The cell at [r, c] must be the start, check its number
        if (renderedGrid[r][c].number) {
            currentClueNumber = renderedGrid[r][c].number
        }
    }

    const outputString = grid.map(row => row.join(' ')).join('\n')

    return { renderedGrid, outputString, numberMap, currentClueNumber }
  }, [grid, cursor, mode, answers])

  const handleClueClick = (num: number, dir: Direction) => {
      const pos = numberMap.get(num)
      if (pos) {
          setCursor({ r: pos.r, c: pos.c, direction: dir })
      }
  }

  // --- Main Render ---

  if (mode === 'create') {
      return (
          <CreatePuzzleForm 
              onSubmit={handleCreatePuzzle}
              onCancel={() => setMode('play')}
          />
      )
  }

  if (loading && grid.length === 0) {
      return <div>Loading puzzle...</div>
  }

  return (
    <>
      <PuzzleControls 
        puzzles={puzzles}
        selectedPuzzleId={selectedPuzzleId}
        mode={mode as Mode}
        onPuzzleSelect={setSelectedPuzzleId}
        onModeToggle={() => setMode(m => m === 'edit' ? 'play' : 'edit')}
        onCreateNew={() => setMode('create')}
      />

      <div className={`main-container ${mode === 'play' ? '' : 'edit-mode-layout'}`}>
          {mode === 'play' && currentClues && (
              <ClueList 
                clues={currentClues}
                currentClueNumber={currentClueNumber}
                currentDirection={cursor?.direction}
                onClueClick={handleClueClick}
              />
          )}

          {grid.length > 0 && (
            <div className="card puzzle-container">
                <CrosswordGrid 
                    grid={renderedGrid}
                    mode={mode as Mode}
                    onCellClick={handleCellClick}
                />
                
                {mode === 'edit' && (
                    <EditOutput 
                        outputString={outputString} 
                        onSave={handleSaveGrid}
                        saving={saving}
                    />
                )}

                {mode === 'play' && (
                    <p>Click to select/toggle direction. Type to fill.</p>
                )}
            </div>
          )}
      </div>
    </>
  )
}

export default App
