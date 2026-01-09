import type { Clue, Direction } from '../../types'

interface FloatingClueBarProps {
  clue: Clue | null
  direction: Direction | undefined
  onTap: () => void
  onDismiss: () => void
}

export function FloatingClueBar({ clue, direction, onTap, onDismiss }: FloatingClueBarProps) {
  if (!clue) return null

  const directionLabel = direction === 'across' ? 'A' : 'D'
  const directionIcon = direction === 'across' ? '→' : '↓'

  return (
    <div
      className="
                fixed top-0 left-0 right-0 z-50
                bg-primary text-white
                shadow-md
                flex items-stretch
            "
    >
      <button
        onClick={onTap}
        className="
                flex-1
                px-4 py-3
                flex items-center gap-2
                text-left
                active:bg-primary-hover
                transition-colors
                border-none cursor-pointer
                font-inherit
                bg-transparent
                text-white
                min-w-0
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
        <span className="flex-1 min-w-0 flex flex-col">
          <span className="font-bold text-xs opacity-90">
            {clue.number}
            {directionLabel}
          </span>
          <span className="line-clamp-1 text-sm font-medium">{clue.clue}</span>
        </span>

        {/* Open List Icon */}
        <span className="text-white/70 text-xs px-1">▲</span>
      </button>

      {/* Separator */}
      <div className="w-px bg-white/10 my-2"></div>

      {/* Dismiss Button */}
      <button
        onClick={onDismiss}
        className="
                px-4
                flex items-center justify-center
                active:bg-primary-hover
                transition-colors
                border-none cursor-pointer
                bg-transparent
                text-white/80
                hover:text-white
            "
        aria-label="Dismiss clue bar"
      >
        <span className="text-xl font-bold">×</span>
      </button>
    </div>
  )
}
