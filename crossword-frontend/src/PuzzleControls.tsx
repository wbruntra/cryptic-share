import type { PuzzleSummary, Mode } from './types'

interface PuzzleControlsProps {
    puzzles: PuzzleSummary[]
    selectedPuzzleId: number | null
    mode: Mode
    onPuzzleSelect: (id: number) => void
    onModeToggle: () => void
    onCreateNew: () => void
}

export function PuzzleControls({ puzzles, selectedPuzzleId, mode, onPuzzleSelect, onModeToggle, onCreateNew }: PuzzleControlsProps) {
    return (
        <div className="header-controls">
            <select 
                value={selectedPuzzleId || ''} 
                onChange={(e) => onPuzzleSelect(Number(e.target.value))}
                className="puzzle-selector"
            >
                <option value="" disabled>Select a Puzzle</option>
                {puzzles.map(p => (
                    <option key={p.id} value={p.id}>{p.title}</option>
                ))}
            </select>
            
            <button className="mode-toggle" onClick={onModeToggle}>
                {mode === 'edit' ? 'Play' : 'Edit'}
            </button>

            <button className="create-button" onClick={onCreateNew}>
                Create New
            </button>
        </div>
    )
}
