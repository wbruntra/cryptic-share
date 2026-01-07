import type { PuzzleSummary, Mode } from './types'

interface PuzzleControlsProps {
  puzzles: PuzzleSummary[]
  selectedPuzzleId: number | null
  mode: Mode
  onPuzzleSelect: (id: number) => void
  onModeToggle: () => void
  onCreateNew: () => void
}

export function PuzzleControls({
  puzzles,
  selectedPuzzleId,
  mode,
  onPuzzleSelect,
  onModeToggle,
  onCreateNew,
}: PuzzleControlsProps) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-4 p-4 mb-8 bg-surface rounded-xl border border-border shadow-sm">
      <select
        value={selectedPuzzleId || ''}
        onChange={(e) => onPuzzleSelect(Number(e.target.value))}
        className="px-4 py-2 rounded-lg bg-input-bg border border-border text-text font-medium outline-none focus:border-primary transition-all cursor-pointer min-w-[200px]"
      >
        <option value="" disabled>
          Select a Puzzle
        </option>
        {puzzles.map((p) => (
          <option key={p.id} value={p.id}>
            {p.title}
          </option>
        ))}
      </select>

      <div className="flex gap-2">
        <button
          className={`px-6 py-2 rounded-lg font-bold transition-all border-none cursor-pointer ${
            mode === 'edit'
              ? 'bg-primary text-white shadow-md'
              : 'bg-input-bg border border-border text-text hover:border-text'
          }`}
          onClick={onModeToggle}
        >
          {mode === 'edit' ? 'Mode: Play' : 'Mode: Edit'}
        </button>

        <button
          className="px-6 py-2 rounded-lg bg-success text-white font-bold shadow-md hover:brightness-110 active:scale-95 transition-all border-none cursor-pointer"
          onClick={onCreateNew}
        >
          Create New
        </button>
      </div>
    </div>
  )
}
