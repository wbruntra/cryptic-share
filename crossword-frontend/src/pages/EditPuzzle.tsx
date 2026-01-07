import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'react-router-dom'
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
                
                const parsedGrid = gridString.split('\n').map((row: string) => 
                    row.trim().split(' ') as CellType[]
                )
                setGrid(parsedGrid)
            } catch (error) {
                console.error("Failed to fetch puzzle:", error)
                alert("Failed to load puzzle.")
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
            const outputString = grid.map(row => row.join(' ')).join('\n')
            await axios.put(`/api/puzzles/${puzzleId}`, {
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

    const handleCellClick = (r: number, c: number) => {
        setGrid(prevGrid => {
            const newGrid = [...prevGrid.map(row => [...row])]
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
        return grid.map(row => row.join(' ')).join('\n')
    }, [grid])

    if (loading) return <div className="loading">Loading puzzle...</div>
    if (!grid.length) return <div className="error">Failed to load puzzle.</div>

    return (
        <div className="edit-puzzle">
            <header className="page-header">
                <h1>Edit: {title}</h1>
            </header>

            <div className="main-container edit-mode-layout">
                <div className="card puzzle-container">
                    <CrosswordGrid 
                        grid={renderedGrid}
                        mode="edit"
                        onCellClick={handleCellClick}
                    />
                    
                    <EditOutput 
                        outputString={outputString}
                        onSave={handleSave}
                        saving={saving}
                    />
                </div>
            </div>
        </div>
    )
}
