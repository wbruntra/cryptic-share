import type { RenderedCell, Mode } from './types'

interface CrosswordGridProps {
  grid: RenderedCell[][]
  mode: Mode
  onCellClick: (r: number, c: number) => void
  changedCells?: Set<string>
  errorCells?: Set<string>
  correctFlashCells?: Set<string>
  incorrectFlashCells?: Set<string>
}

export function CrosswordGrid({
  grid,
  mode,
  onCellClick,
  changedCells,
  errorCells,
  correctFlashCells,
  incorrectFlashCells,
}: CrosswordGridProps) {
  return (
    <div className="flex justify-center max-w-full w-full overflow-hidden">
      <div
        className="max-w-full w-full overflow-auto flex-1 p-1 md:p-2 scrollbar-thin scrollbar-thumb-border"
        role="grid"
        aria-label="Crossword Grid"
      >
        <div className="flex flex-col border-[2px] border-border bg-grid-border gap-[1px] w-max mx-auto">
          {grid.map((row, rIndex) => (
            <div key={rIndex} className="flex gap-[1px] bg-grid-border" role="row">
              {row.map((cell, cIndex) => {
                const isBlack = cell.type === 'B'
                const isChanged = changedCells?.has(`${rIndex}-${cIndex}`)
                const isError = errorCells?.has(`${rIndex}-${cIndex}`)
                const isCorrectFlash = correctFlashCells?.has(`${rIndex}-${cIndex}`)
                const isIncorrectFlash = incorrectFlashCells?.has(`${rIndex}-${cIndex}`)
                let bgClass = 'bg-surface'

                if (isBlack) {
                  bgClass = 'bg-black'
                } else if (cell.isSelected) {
                  bgClass = 'bg-selection'
                } else if (isCorrectFlash) {
                  bgClass = 'bg-green-500 dark:bg-green-600' // Green flash for correct
                } else if (isIncorrectFlash) {
                  bgClass = 'bg-red-500 dark:bg-red-600' // Red flash for incorrect
                } else if (isError) {
                  bgClass = 'bg-[#ffeb3b] dark:bg-[#fbc02d]' // Vivid yellow for error (adjust for dark mode)
                } else if (isChanged) {
                  bgClass = 'bg-changed-cell'
                } else if (cell.isActiveWord) {
                  bgClass = 'bg-active-word'
                }

                return (
                  <div
                    key={`${rIndex}-${cIndex}`}
                    className={`
                        w-10 h-10 md:w-11 md:h-11 flex items-center justify-center relative select-none font-mono cursor-pointer transition-colors duration-100
                        ${bgClass}
                        ${cell.isSelected ? '!text-black z-10' : ''}
                        ${!isBlack && !cell.isSelected && (isCorrectFlash || isIncorrectFlash) ? 'text-white font-bold' : ''}
                        ${
                          !isBlack && !cell.isSelected && !isChanged && !isError && !isCorrectFlash && !isIncorrectFlash ? 'text-text' : ''
                        }
                        ${!isBlack && !cell.isSelected && isChanged && !isCorrectFlash && !isIncorrectFlash ? 'text-text-changed' : ''}
                        ${!isBlack && !cell.isSelected && isError && !isCorrectFlash && !isIncorrectFlash ? 'text-black font-bold' : ''}
                        ${
                          !isBlack && !cell.isSelected && !cell.isActiveWord
                            ? 'hover:bg-input-bg'
                            : ''
                        }
                    `}
                    onClick={() => onCellClick(rIndex, cIndex)}
                    role="gridcell"
                    tabIndex={isBlack ? -1 : 0}
                    aria-label={
                      isBlack
                        ? 'Black square'
                        : `Cell ${rIndex + 1}, ${cIndex + 1}${
                            cell.number ? `, Clue ${cell.number}` : ''
                          }`
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        onCellClick(rIndex, cIndex)
                      }
                    }}
                  >
                    {cell.number && (
                      <span className="absolute top-[2px] left-[2px] text-[10px] md:text-[11px] font-bold text-text-secondary leading-none pointer-events-none">
                        {cell.number}
                      </span>
                    )}
                    {mode === 'play' && cell.answer && (
                      <span className="text-xl md:text-2xl font-bold uppercase z-1 shrink-0">
                        {cell.answer}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
