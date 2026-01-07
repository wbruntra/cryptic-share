import { useRef, useEffect } from 'react'
import type { Clue, Direction } from './types'

interface ClueListProps {
  clues: { across: Clue[]; down: Clue[] }
  currentClueNumber: number | null
  currentDirection: Direction | undefined
  onClueClick: (num: number, dir: Direction) => void
}

export function ClueList({
  clues,
  currentClueNumber,
  currentDirection,
  onClueClick,
}: ClueListProps) {
  const selectedRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (selectedRef.current) {
      selectedRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
    }
  }, [currentClueNumber, currentDirection])

  const renderClueSection = (title: string, items: Clue[], dir: Direction) => (
    <div className="mb-8">
      <h3 className="text-xl font-bold mb-4 pb-2 border-b border-border sticky top-0 bg-surface z-10 px-2">
        {title}
      </h3>
      <div className="space-y-1">
        {items.map((clue) => {
          const isSelected = currentDirection === dir && currentClueNumber === clue.number
          return (
            <div
              key={`${dir}-${clue.number}`}
              ref={isSelected ? selectedRef : null}
              className={`
                                p-3 rounded-lg cursor-pointer transition-all duration-200 flex items-start gap-3
                                ${
                                  isSelected
                                    ? 'bg-primary text-white font-bold shadow-md'
                                    : 'text-text hover:bg-input-bg active:bg-border'
                                }
                            `}
              onClick={() => onClueClick(clue.number, dir)}
            >
              <span
                className={`w-6 shrink-0 font-bold ${
                  isSelected ? 'text-white' : 'text-text-secondary'
                }`}
              >
                {clue.number}
              </span>
              <span className="text-[0.95rem] leading-snug">{clue.clue}</span>
            </div>
          )
        })}
      </div>
    </div>
  )

  return (
    <div className="w-full md:w-[400px] h-[400px] md:h-[650px] overflow-y-auto scrollbar-thin scrollbar-thumb-border bg-surface rounded-xl border border-border px-4 shadow-inner shrink-0 relative">
      <div className="py-4">
        {renderClueSection('Across', clues.across, 'across')}
        {renderClueSection('Down', clues.down, 'down')}
      </div>
    </div>
  )
}
