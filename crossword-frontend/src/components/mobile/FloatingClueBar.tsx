import type { Clue, Direction } from '../../types'

interface FloatingClueBarProps {
  clue: Clue | null
  direction: Direction | undefined
  onTap: () => void
}

export function FloatingClueBar({ clue, direction, onTap }: FloatingClueBarProps) {
  if (!clue) return null

  const directionLabel = direction === 'across' ? 'A' : 'D'
  const directionIcon = direction === 'across' ? '→' : '↓'

  return (
    <button
      onClick={onTap}
      className="
                fixed top-0 left-0 right-0 z-30
                bg-[var(--primary-color)] text-white
                px-4 py-3
                flex items-center gap-2
                text-left
                shadow-md
                active:bg-[var(--primary-hover)]
                transition-colors
                border-none cursor-pointer
                font-inherit
            "
      aria-label={`Current clue: ${clue.number} ${direction}. Tap to see all clues.`}
    >
      {/* Direction indicator */}
      <span
        className="
                flex items-center justify-center
                w-8 h-8 
                bg-white/20 rounded-full
                text-sm font-bold
                shrink-0
            "
      >
        {directionIcon}
      </span>

      {/* Clue text */}
      <span className="flex-1 min-w-0">
        <span className="font-bold">
          {clue.number}
          {directionLabel}:
        </span>{' '}
        <span className="line-clamp-2">{clue.clue}</span>
      </span>

      {/* Chevron to indicate tappable */}
      <span className="text-white/70 shrink-0" aria-hidden="true">
        ▼
      </span>
    </button>
  )
}
