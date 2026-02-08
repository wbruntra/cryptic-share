import React, { memo, useMemo } from 'react'
import type { RenderedCell, Mode } from './types'
import { getAttributionBackground, getAttributionBorder } from './utils/attributionColors'
import { GridCell } from './GridCell'

interface CrosswordGridProps {
  grid: RenderedCell[][]
  mode: Mode
  onCellClick: (r: number, c: number) => void
  changedCells?: Set<string>
  errorCells?: Set<string>
  correctFlashCells?: Set<string>
  incorrectFlashCells?: Set<string>
  attributions?: Record<string, { userId: number | null; username: string; timestamp: string }>
  showAttributions?: boolean
  clueMetadata?: Array<{ number: number; direction: 'across' | 'down'; row: number; col: number }>
}

export function CrosswordGrid({
  grid,
  mode,
  onCellClick,
  changedCells,
  errorCells,
  correctFlashCells,
  incorrectFlashCells,
  attributions,
  showAttributions = false,
  clueMetadata,
}: CrosswordGridProps) {
  // Pre-compute cell attributions map for O(1) lookup
  const cellAttributionMap = useMemo(() => {
    if (!attributions || !showAttributions || !clueMetadata)
      return new Map<string, { userId: number | null; username: string }>()

    const map = new Map<string, { userId: number | null; username: string }>()

    for (const meta of clueMetadata) {
      const clueKey = `${meta.number}-${meta.direction}`
      const attr = attributions[clueKey]
      if (!attr) continue

      let r = meta.row
      let c = meta.col

      // Trace the word and mark each cell
      while (r < grid.length && c < grid[0].length && grid[r][c].type !== 'B') {
        const cellKey = `${r}-${c}`
        if (!map.has(cellKey)) {
          map.set(cellKey, { userId: attr.userId, username: attr.username })
        }
        if (meta.direction === 'across') c++
        else r++
      }
    }

    return map
  }, [attributions, showAttributions, clueMetadata, grid])

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
                const cellKey = `${rIndex}-${cIndex}`
                return (
                  <GridCell
                    key={cellKey}
                    cell={cell}
                    r={rIndex}
                    c={cIndex}
                    mode={mode}
                    isChanged={changedCells?.has(cellKey) ?? false}
                    isError={errorCells?.has(cellKey) ?? false}
                    isCorrectFlash={correctFlashCells?.has(cellKey) ?? false}
                    isIncorrectFlash={incorrectFlashCells?.has(cellKey) ?? false}
                    attribution={cellAttributionMap.get(cellKey) ?? null}
                    showAttributions={showAttributions}
                    onCellClick={onCellClick}
                  />
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
