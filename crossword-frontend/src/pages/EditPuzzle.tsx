import { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import axios from 'axios'
import type { CellType } from '../types'
import { CrosswordGrid } from '../CrosswordGrid'
import { EditOutput } from '../EditOutput'
import { parseGridJson, parseGridString, renderGrid } from '../utils/gridRenderer'
import { validateClues } from '../utils/clueHelpers'

export function EditPuzzle() {
  const { puzzleId } = useParams<{ puzzleId: string }>()

  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('')
  const [grid, setGrid] = useState<CellType[][]>([])
  const [cluesJson, setCluesJson] = useState('')
  const [saving, setSaving] = useState(false)
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [isJsonValid, setIsJsonValid] = useState(true)
  const [replaceGridInput, setReplaceGridInput] = useState('')
  const [replaceGridError, setReplaceGridError] = useState<string | null>(null)

  // Track previous grid string to detect changes
  const prevGridStringRef = useRef<string>('')

  const applyReplaceGridInput = () => {
    setReplaceGridError(null)

    const raw = replaceGridInput.trim()
    if (!raw) {
      setReplaceGridError('Paste a grid string or JSON array first.')
      return
    }

    const parsedJson = parseGridJson(raw)
    const candidate = parsedJson.length > 0 ? parsedJson : parseGridString(raw)

    if (candidate.length === 0 || candidate[0]?.length === 0) {
      setReplaceGridError(
        'Invalid grid format. Use JSON array of row strings or newline-separated rows.',
      )
      return
    }

    const width = candidate[0].length
    for (const row of candidate) {
      if (row.length !== width) {
        setReplaceGridError('Grid rows must all have the same number of columns.')
        return
      }
      for (const cell of row) {
        if (cell !== 'N' && cell !== 'W' && cell !== 'B') {
          setReplaceGridError("Grid can only contain 'N', 'W', and 'B' cells.")
          return
        }
      }
    }

    setGrid(candidate)
  }

  useEffect(() => {
    if (!puzzleId) return

    const fetchPuzzle = async () => {
      setLoading(true)
      try {
        const response = await axios.get(`/api/puzzles/${puzzleId}`)
        const { title, grid: gridString, clues } = response.data
        setTitle(title)

        const parsedGrid = gridString
          .split('\n')
          .map((row: string) => row.trim().split(' ') as CellType[])
        setGrid(parsedGrid)
        prevGridStringRef.current = gridString

        // Initialize clues JSON
        if (clues) {
          setCluesJson(JSON.stringify(clues, null, 2))
        } else {
          setCluesJson(JSON.stringify({ across: [], down: [] }, null, 2))
        }
      } catch (error) {
        console.error('Failed to fetch puzzle:', error)
        alert('Failed to load puzzle.')
      } finally {
        setLoading(false)
      }
    }

    fetchPuzzle()
  }, [puzzleId])

  // Validate clues when grid or json changes
  useEffect(() => {
    if (grid.length === 0) return

    // Quick syntactical check
    try {
      JSON.parse(cluesJson)
      setIsJsonValid(true)
    } catch {
      setIsJsonValid(false)
      setValidationErrors(['Invalid JSON format'])
      return
    }

    const errors = validateClues(grid, cluesJson)
    setValidationErrors(errors)
  }, [grid, cluesJson])

  const handleSave = async () => {
    if (!puzzleId) return

    if (validationErrors.length > 0) {
      if (!confirm('There are validation errors. Are you sure you want to save?')) {
        return
      }
    }

    setSaving(true)
    try {
      const outputString = grid.map((row) => row.join(' ')).join('\n')
      // cluesJson is already a string, but we want to send it as an object
      const cluesObj = JSON.parse(cluesJson)

      await axios.put(`/api/puzzles/${puzzleId}`, {
        grid: outputString,
        clues: cluesObj,
      })
      alert('Puzzle saved successfully!')
    } catch (error) {
      console.error('Failed to save puzzle:', error)
      alert('Failed to save puzzle.')
    } finally {
      setSaving(false)
    }
  }

  const handleCellClick = (r: number, c: number) => {
    setGrid((prevGrid) => {
      const newGrid = [...prevGrid.map((row) => [...row])]
      const current = newGrid[r][c]
      let next: CellType = 'N'
      if (current === 'N') next = 'W'
      else if (current === 'W') next = 'B'
      else if (current === 'B') next = 'N'
      newGrid[r][c] = next
      return newGrid
    })
  }

  const { renderedGrid } = useMemo(() => {
    if (grid.length === 0) return { renderedGrid: [] }
    return renderGrid({ grid, mode: 'edit' })
  }, [grid])

  const outputString = useMemo(() => {
    if (grid.length === 0) return ''
    return grid.map((row) => row.join(' ')).join('\n')
  }, [grid])

  if (loading)
    return (
      <div className="flex items-center justify-center min-h-[50vh] text-text-secondary animate-pulse gap-2">
        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
        Loading puzzle layout...
      </div>
    )

  if (!grid.length)
    return (
      <div className="max-w-md mx-auto mt-12 p-8 bg-error/10 border border-error/20 rounded-2xl text-error text-center font-medium">
        Failed to load puzzle.
      </div>
    )

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 pb-12">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-10 pb-6 border-b border-border">
        <div>
          <h1 className="text-3xl font-bold text-text italic tracking-tight">
            Edit Puzzle: {title}
          </h1>
          <p className="text-text-secondary text-sm font-medium">
            Modify the grid structure and clues JSON below.
          </p>
        </div>
        <div className="flex gap-4">
          <Link
            to="/admin"
            className="px-6 py-2.5 rounded-xl bg-input-bg border border-border text-text-secondary font-bold hover:text-text hover:border-text transition-all text-center no-underline flex items-center justify-center gap-2"
          >
            Cancel
          </Link>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2.5 rounded-xl bg-primary text-white font-bold shadow-md hover:bg-primary-hover hover:shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed border-none cursor-pointer"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </header>

      <div className="flex flex-col gap-8">
        {/* Grid Editor (Top) */}
        <div className="flex flex-col gap-8">
          <div className="bg-surface p-6 md:p-10 rounded-2xl shadow-xl border border-border relative overflow-hidden">
            <div className="absolute top-0 left-0 w-2 h-full bg-primary/20"></div>
            <h2 className="text-xl font-bold mb-6 text-text">Grid Editor</h2>
            <div className="flex justify-center mb-6">
              <div className="bg-bg p-4 rounded-xl border border-border shadow-inner">
                <CrosswordGrid grid={renderedGrid} mode="edit" onCellClick={handleCellClick} />
              </div>
            </div>

            <div className="mt-6 p-4 bg-bg rounded-2xl border border-border shadow-inner">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
                <label className="text-sm font-semibold text-text-secondary">
                  Replace Grid (paste string or JSON array)
                </label>
                <button
                  type="button"
                  onClick={applyReplaceGridInput}
                  className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-primary text-white font-bold shadow-md hover:bg-primary-hover active:scale-[0.98] transition-all border-none cursor-pointer"
                >
                  Replace Grid
                </button>
              </div>
              <textarea
                value={replaceGridInput}
                onChange={(e) => setReplaceGridInput(e.target.value)}
                placeholder='["N W N...", "W B W..."] OR\nN W N...\nW B W...'
                className="w-full px-4 py-3 rounded-xl bg-input-bg border border-border text-text font-mono text-xs min-h-[160px] focus:border-primary outline-none transition-all resize-y"
                spellCheck={false}
              />
              {replaceGridError && (
                <div className="mt-3 p-3 bg-error/10 border border-error/20 rounded-xl text-error text-sm font-medium">
                  {replaceGridError}
                </div>
              )}
            </div>

            <EditOutput outputString={outputString} onSave={handleSave} saving={saving} />
          </div>
        </div>

        {/* Clue JSON Editor (Bottom) */}
        <div className="flex flex-col gap-6">
          <div className="bg-surface p-6 md:p-8 rounded-2xl shadow-xl border border-border h-full flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-text">Clues JSON</h2>
              <div
                className={`px-3 py-1 rounded-full text-xs font-bold border ${
                  validationErrors.length === 0
                    ? 'bg-success/10 text-success border-success/30'
                    : 'bg-error/10 text-error border-error/30'
                }`}
              >
                {validationErrors.length === 0 ? '✓ Valid' : `${validationErrors.length} Issues`}
              </div>
            </div>

            <textarea
              value={cluesJson}
              onChange={(e) => setCluesJson(e.target.value)}
              placeholder='{"across": [{"number": 1, "clue": "..."}], "down": [...]}'
              className={`w-full flex-1 p-4 rounded-xl bg-input-bg border text-text font-mono text-sm leading-relaxed outline-none transition-all resize-none min-h-[400px] ${
                !isJsonValid
                  ? 'border-error focus:border-error focus:ring-1 focus:ring-error'
                  : 'border-border focus:border-primary focus:ring-1 focus:ring-primary'
              }`}
              spellCheck={false}
            />

            {validationErrors.length > 0 && (
              <div className="mt-4 p-4 bg-error/5 border border-error/20 rounded-xl space-y-1 max-h-[200px] overflow-y-auto custom-scrollbar">
                <h4 className="text-error font-bold text-sm mb-2">Validation Issues:</h4>
                {validationErrors.map((err, i) => (
                  <div key={i} className="flex gap-2 items-start text-xs text-error/90">
                    <span>•</span>
                    <span>{err}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="p-6 bg-surface rounded-2xl border border-border shadow-md">
            <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
              <span className="text-primary tracking-tighter">ℹ️</span> Editor Info
            </h3>
            <p className="text-sm text-text-secondary leading-relaxed">
              Grid structure and clues must match. Numbered cells ('N') in the grid require
              corresponding entries in the JSON.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
