import { useState, useEffect } from 'react'
import axios from 'axios'
import { parseGridString, parseGridJson, renderGrid } from './utils/gridRenderer'
import { CrosswordGrid } from './CrosswordGrid'
import { PuzzleSummary } from './types'

interface CreatePuzzleFormProps {
    onSubmit: (title: string, grid: string, cluesJson: string) => Promise<void>
    onCancel: () => void
}

export function CreatePuzzleForm({ onSubmit, onCancel }: CreatePuzzleFormProps) {
    const [title, setTitle] = useState('')
    const [grid, setGrid] = useState('')
    const [cluesJson, setCluesJson] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [puzzles, setPuzzles] = useState<PuzzleSummary[]>([])
    
    // Fetch puzzles for copy functionality
    useEffect(() => {
        axios.get('/api/puzzles')
            .then(res => setPuzzles(res.data))
            .catch(console.error)
    }, [])

    const handleCopyGrid = async (id: number) => {
        if (!id) return
        try {
            const res = await axios.get(`/api/puzzles/${id}`)
            setGrid(res.data.grid)
        } catch (err) {
            console.error(err)
            setError('Failed to copy grid')
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)
        
        if (!title.trim() || !grid.trim() || !cluesJson.trim()) {
            setError('All fields are required')
            return
        }

        // Validate JSON Clues
        try {
            JSON.parse(cluesJson)
        } catch {
            setError('Invalid JSON format for clues')
            return
        }

        // Validate and Format Grid
        // Input can be JSON array of strings OR newline separated string
        let formattedGrid = ''
        try {
            // First try parsing as JSON
            const parsedJson = parseGridJson(grid)
            if (parsedJson.length > 0) {
                formattedGrid = parsedJson.map(row => row.join(' ')).join('\n')
            } else {
                // If not JSON, try newline separated
                const parsedString = parseGridString(grid)
                if (parsedString.length > 0 && parsedString[0].length > 0) {
                    formattedGrid = parsedString.map(row => row.join(' ')).join('\n')
                } else {
                    throw new Error('Invalid grid format. Use JSON array or newline-separated rows.')
                }
            }
        } catch (err: unknown) {
             const message = err instanceof Error ? err.message : 'Invalid grid format'
             setError('Grid Error: ' + message)
             return
        }

        setSubmitting(true)
        try {
            await onSubmit(title, formattedGrid, cluesJson)
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to create puzzle'
            setError(message)
        } finally {
            setSubmitting(false)
        }
    }

    // Generate preview data
    const previewGridData = (() => {
        const parsedJson = parseGridJson(grid)
        if (parsedJson.length > 0) return parsedJson
        return parseGridString(grid)
    })()
    
    const { renderedGrid: previewRenderedGrid } = renderGrid({ 
        grid: previewGridData,
        mode: 'view' 
    })

    return (
        <div className="create-puzzle-form">
            <h2>Create New Puzzle</h2>
            <form onSubmit={handleSubmit}>
                <div className="form-group">
                    <label htmlFor="title">Puzzle Title:</label>
                    <input 
                        id="title"
                        type="text" 
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="e.g., Cryptic #2"
                    />
                </div>

                <div className="form-group">
                    <label htmlFor="copy-grid">Copy Grid From (Optional):</label>
                    <select 
                        id="copy-grid" 
                        onChange={(e) => handleCopyGrid(Number(e.target.value))}
                        defaultValue=""
                    >
                        <option value="" disabled>Select existing puzzle...</option>
                        {puzzles.map(p => (
                            <option key={p.id} value={p.id}>{p.title}</option>
                        ))}
                    </select>
                </div>

                <div className="form-group grid-input-container">
                    <div className="grid-text-input">
                        <label htmlFor="grid">Grid (JSON Array or Newlines):</label>
                        <textarea 
                            id="grid"
                            value={grid}
                            onChange={(e) => setGrid(e.target.value)}
                            placeholder='["N W N...", "W B W..."] OR&#10;N W N...&#10;W B W...'
                            rows={15}
                        />
                    </div>
                    
                    <div className="grid-preview">
                        <label>Preview:</label>
                        <div className="preview-box">
                            {previewRenderedGrid.length > 0 ? (
                                <CrosswordGrid 
                                    grid={previewRenderedGrid} 
                                    mode="edit" 
                                    onCellClick={() => {}} 
                                />
                            ) : (
                                <div className="no-preview">Invalid Grid</div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="form-group">
                    <label htmlFor="clues">Clues (JSON format):</label>
                    <textarea 
                        id="clues"
                        value={cluesJson}
                        onChange={(e) => setCluesJson(e.target.value)}
                        placeholder='{"across": [{"number": 1, "clue": "..."}], "down": [...]}'
                        rows={10}
                    />
                </div>

                {error && <div className="error-message">{error}</div>}

                <div className="form-actions">
                    <button type="submit" disabled={submitting}>
                        {submitting ? 'Creating...' : 'Create Puzzle'}
                    </button>
                    <button type="button" onClick={onCancel} disabled={submitting}>
                        Cancel
                    </button>
                </div>
            </form>
        </div>
    )
}
