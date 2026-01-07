import type { Clue, Direction } from './types'

interface ClueListProps {
    clues: { across: Clue[], down: Clue[] }
    currentClueNumber: number | null
    currentDirection: Direction | undefined
    onClueClick: (num: number, dir: Direction) => void
}

export function ClueList({ clues, currentClueNumber, currentDirection, onClueClick }: ClueListProps) {
    return (
        <div className="clues-container">
            <div className="clues-section">
                <h3>Across</h3>
                {clues.across.map((clue) => (
                    <div 
                        key={`a-${clue.number}`} 
                        className={`clue-item ${currentDirection === 'across' && currentClueNumber === clue.number ? 'selected' : ''}`}
                        onClick={() => onClueClick(clue.number, 'across')}
                    >
                        <span className="clue-number">{clue.number}</span>
                        {clue.clue}
                    </div>
                ))}
            </div>
            <div className="clues-section">
                <h3>Down</h3>
                {clues.down.map((clue) => (
                    <div 
                        key={`d-${clue.number}`} 
                        className={`clue-item ${currentDirection === 'down' && currentClueNumber === clue.number ? 'selected' : ''}`}
                        onClick={() => onClueClick(clue.number, 'down')}
                    >
                        <span className="clue-number">{clue.number}</span>
                        {clue.clue}
                    </div>
                ))}
            </div>
        </div>
    )
}
