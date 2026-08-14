import { parseGrid } from '../utils/gridRenderer'

interface MiniGridProps {
  grid: string
  className?: string
}

export function MiniGrid({ grid, className = '' }: MiniGridProps) {
  const cells = parseGrid(grid)

  if (cells.length === 0 || cells[0].length === 0) return null

  const rows = cells.length
  const cols = cells[0].length

  return (
    <div
      className={`grid gap-px bg-border rounded-md overflow-hidden border border-border ${className}`}
      style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, aspectRatio: `${cols} / ${rows}` }}
    >
      {cells.flatMap((row, r) =>
        row.map((cell, c) => (
          <div key={`${r}-${c}`} className={cell === 'B' ? 'bg-gray-800 dark:bg-black' : 'bg-white'} />
        )),
      )}
    </div>
  )
}
