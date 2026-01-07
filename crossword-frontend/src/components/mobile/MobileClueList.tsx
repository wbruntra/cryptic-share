import type { Clue, Direction } from '../../types'

interface MobileClueListProps {
  clues: { across: Clue[]; down: Clue[] }
  currentClueNumber: number | null
  currentDirection: Direction | undefined
  onClueSelect: (num: number, dir: Direction) => void
}

export function MobileClueList({
  clues,
  currentClueNumber,
  currentDirection,
  onClueSelect,
}: MobileClueListProps) {
  const renderClue = (clue: Clue, dir: Direction) => {
    const isSelected = currentDirection === dir && currentClueNumber === clue.number

    return (
      <button
        key={`${dir}-${clue.number}`}
        onClick={() => onClueSelect(clue.number, dir)}
        className={`
                    w-full text-left px-4 py-3
                    border-none bg-transparent
                    flex items-start gap-3
                    transition-colors
                    cursor-pointer
                    ${
                      isSelected
                        ? 'bg-[var(--primary-color)] text-white'
                        : 'text-[var(--text-color)] active:bg-[var(--input-bg)]'
                    }
                `}
      >
        <span
          className={`
                    font-bold shrink-0 w-8
                    ${isSelected ? 'text-white' : 'text-[var(--text-secondary)]'}
                `}
        >
          {clue.number}
        </span>
        <span className="flex-1 text-sm leading-relaxed">{clue.clue}</span>
      </button>
    )
  }

  return (
    <div className="pb-4">
      {/* Across Section */}
      <div className="mb-4">
        <h3
          className="
                    px-4 py-2 
                    text-sm font-bold uppercase tracking-wide
                    text-[var(--text-secondary)]
                    bg-[var(--bg-color)]
                    sticky top-0
                    border-b border-[var(--border-color)]
                    m-0
                "
        >
          Across
        </h3>
        <div className="divide-y divide-[var(--border-color)]">
          {clues.across.map((clue) => renderClue(clue, 'across'))}
        </div>
      </div>

      {/* Down Section */}
      <div>
        <h3
          className="
                    px-4 py-2 
                    text-sm font-bold uppercase tracking-wide
                    text-[var(--text-secondary)]
                    bg-[var(--bg-color)]
                    sticky top-0
                    border-b border-[var(--border-color)]
                    m-0
                "
        >
          Down
        </h3>
        <div className="divide-y divide-[var(--border-color)]">
          {clues.down.map((clue) => renderClue(clue, 'down'))}
        </div>
      </div>
    </div>
  )
}
