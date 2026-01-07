import { useRef, useEffect } from 'react'
import type { Clue, Direction } from './types'

interface ClueListProps {
    clues: { across: Clue[], down: Clue[] }
    currentClueNumber: number | null
    currentDirection: Direction | undefined
    onClueClick: (num: number, dir: Direction) => void
}

export function ClueList({ clues, currentClueNumber, currentDirection, onClueClick }: ClueListProps) {
    const selectedRef = useRef<HTMLDivElement | null>(null)

    useEffect(() => {
        if (selectedRef.current) {
            selectedRef.current.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
            })
        }
    }, [currentClueNumber, currentDirection])

    return (
        <div className="clues-container">
            <div className="clues-section">
                <h3>Across</h3>
                {clues.across.map((clue) => {
                    const isSelected = currentDirection === 'across' && currentClueNumber === clue.number;
                    return (
                        <div 
                            key={`a-${clue.number}`} 
                            ref={isSelected ? selectedRef : null}
                            className={`clue-item ${isSelected ? 'selected' : ''}`}
                            onClick={() => onClueClick(clue.number, 'across')}
                        >
                            <span className="clue-number">{clue.number}</span>
                            {clue.clue}
                        </div>
                    )
                })}
            </div>
            <div className="clues-section">
                <h3>Down</h3>
                {clues.down.map((clue) => {
                    const isSelected = currentDirection === 'down' && currentClueNumber === clue.number;
                    return (
                        <div 
                            key={`d-${clue.number}`} 
                            ref={isSelected ? selectedRef : null}
                            className={`clue-item ${isSelected ? 'selected' : ''}`}
                            onClick={() => onClueClick(clue.number, 'down')}
                        >
                            <span className="clue-number">{clue.number}</span>
                            {clue.clue}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
