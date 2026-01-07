import { useState, useEffect, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import axios from 'axios'
import type { CellType } from '../types'
import { CrosswordGrid } from '../CrosswordGrid'
import { EditOutput } from '../EditOutput'
import { renderGrid } from '../utils/gridRenderer'

export function EditPuzzle() {
  const { puzzleId } = useParams<{ puzzleId: string }>()

  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('')
  const [grid, setGrid] = useState<CellType[][]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!puzzleId) return

    const fetchPuzzle = async () => {
      setLoading(true)
      try {
        const response = await axios.get(`/api/puzzles/${puzzleId}`)
        const { title, grid: gridString } = response.data
        setTitle(title)

        const parsedGrid = gridString
          .split('\n')
          .map((row: string) => row.trim().split(' ') as CellType[])
        setGrid(parsedGrid)
      } catch (error) {
        console.error('Failed to fetch puzzle:', error)
        alert('Failed to load puzzle.')
      } finally {
        setLoading(false)
      }
    }

    fetchPuzzle()
  }, [puzzleId])

  const handleSave = async () => {
    if (!puzzleId) return
    setSaving(true)
    try {
      const outputString = grid.map((row) => row.join(' ')).join('\n')
      await axios.put(`/api/puzzles/${puzzleId}`, {
        grid: outputString,
      })
      alert('Grid layout updated successfully!')
    } catch (error) {
      console.error('Failed to save grid:', error)
      alert('Failed to save grid.')
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
            Edit Grid: {title}
          </h1>
          <p className="text-text-secondary text-sm font-medium">
            Click cells below to modify the grid structure.
          </p>
        </div>
        <Link
          to="/admin"
          className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-input-bg border border-border text-text-secondary font-bold hover:text-text hover:border-text transition-all text-center no-underline flex items-center justify-center gap-2"
        >
          Back to Dashboard
        </Link>
      </header>

      <div className="max-w-4xl mx-auto">
        <div className="bg-surface p-6 md:p-10 rounded-2xl shadow-xl border border-border relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-2 h-full bg-primary/20"></div>

          <div className="mb-8 flex justify-center">
            <div className="bg-bg p-4 rounded-xl border border-border shadow-inner">
              <CrosswordGrid grid={renderedGrid} mode="edit" onCellClick={handleCellClick} />
            </div>
          </div>

          <EditOutput outputString={outputString} onSave={handleSave} saving={saving} />
        </div>

        <div className="mt-8 p-6 bg-surface rounded-2xl border border-border shadow-md">
          <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
            <span className="text-primary tracking-tighter">ℹ️</span> Component Information
          </h3>
          <p className="text-sm text-text-secondary leading-relaxed">
            This editor only modifies the physical layout (structure) of the grid. To change the
            title or clues, use the main puzzle editor from the dashboard.
          </p>
        </div>
      </div>
    </div>
  )
}
