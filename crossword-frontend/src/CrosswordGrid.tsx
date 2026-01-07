import type { RenderedCell, Mode } from './types'

interface CrosswordGridProps {
    grid: RenderedCell[][]
    mode: Mode
    onCellClick: (r: number, c: number) => void
}

export function CrosswordGrid({ grid, mode, onCellClick }: CrosswordGridProps) {
    return (
        <div className="grid-container">
            {grid.map((row, rIndex) => (
                <div key={rIndex} className="grid-row">
                    {row.map((cell, cIndex) => (
                        <div 
                            key={`${rIndex}-${cIndex}`} 
                            className={`
                                grid-cell 
                                ${cell.type === 'B' ? 'black' : 'white'}
                                ${cell.isSelected ? 'selected' : ''}
                                ${cell.isActiveWord ? 'active-word' : ''}
                            `}
                            onClick={() => onCellClick(rIndex, cIndex)}
                        >
                            {cell.number && <span className="cell-number">{cell.number}</span>}
                            {mode === 'play' && cell.answer && <span className="cell-content">{cell.answer}</span>}
                        </div>
                    ))}
                </div>
            ))}
        </div>
    )
}
