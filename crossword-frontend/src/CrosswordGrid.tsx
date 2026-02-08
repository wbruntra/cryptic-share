import React, { memo, useMemo } from 'react'
import type { RenderedCell, Mode } from './types'
import { getAttributionBackground, getAttributionBorder } from './utils/attributionColors'

interface GridCellProps {
  cell: RenderedCell
  r: number
  c: number
  mode: Mode
  isChanged: boolean
  isError: boolean
  isCorrectFlash: boolean
  isIncorrectFlash: boolean
  attribution: { userId: number | null; username: string } | null
  showAttributions: boolean
  onClick: () => void
}

// Memoized cell component to prevent unnecessary re-renders
const GridCell = memo(function GridCell({
  cell,
  mode,
  isChanged,
  isError,
  isCorrectFlash,
  isIncorrectFlash,
  attribution,
  showAttributions,
  onClick,
}: GridCellProps) {
  const isBlack = cell.type === 'B'

  let bgClass = 'bg-surface'
  let borderStyle: React.CSSProperties = {}

  if (isBlack) {
    bgClass = 'bg-black'
  } else if (cell.isSelected) {
    bgClass = 'bg-selection'
  } else if (isCorrectFlash) {
    bgClass = 'bg-green-500 dark:bg-green-600'
  } else if (isIncorrectFlash) {
    bgClass = 'bg-red-500 dark:bg-red-600'
  } else if (isError) {
    bgClass = 'bg-[#ffeb3b] dark:bg-[#fbc02d]'
  } else if (isChanged) {
    bgClass = 'bg-changed-cell'
  } else if (cell.isActiveWord) {
    bgClass = 'bg-active-word'
  }

  // Apply attribution styling if enabled
  if (
    attribution &&
    showAttributions &&
    !isBlack &&
    !isCorrectFlash &&
    !isIncorrectFlash &&
    !isError
  ) {
    borderStyle = {
      backgroundColor: getAttributionBackground(attribution.userId),
      borderLeft: `3px solid ${getAttributionBorder(attribution.userId)}`,
      borderTop: `3px solid ${getAttributionBorder(attribution.userId)}`,
      borderRight: `3px solid ${getAttributionBorder(attribution.userId)}`,
      borderBottom: `3px solid ${getAttributionBorder(attribution.userId)}`,
    }
  }

  return (
    <div
      className={`
          w-10 h-10 md:w-11 md:h-11 flex items-center justify-center relative select-none font-mono cursor-pointer transition-colors duration-100
          ${bgClass}
          ${cell.isSelected ? '!text-black z-10' : ''}
          ${
            !isBlack && !cell.isSelected && (isCorrectFlash || isIncorrectFlash)
              ? 'text-white font-bold'
              : ''
          }
          ${
            !isBlack &&
            !cell.isSelected &&
            !isChanged &&
            !isError &&
            !isCorrectFlash &&
            !isIncorrectFlash
              ? 'text-text'
              : ''
          }
          ${
            !isBlack && !cell.isSelected && isChanged && !isCorrectFlash && !isIncorrectFlash
              ? 'text-text-changed'
              : ''
          }
          ${
            !isBlack && !cell.isSelected && isError && !isCorrectFlash && !isIncorrectFlash
              ? 'text-black font-bold'
              : ''
          }
          ${!isBlack && !cell.isSelected && !cell.isActiveWord ? 'hover:bg-input-bg' : ''}
      `}
      style={borderStyle}
      onClick={onClick}
      role="gridcell"
      tabIndex={isBlack ? -1 : 0}
      aria-label={isBlack ? 'Black square' : `Cell${cell.number ? `, Clue ${cell.number}` : ''}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
    >
      {cell.number && (
        <span className="absolute top-[2px] left-[2px] text-[10px] md:text-[11px] font-bold text-text-secondary leading-none pointer-events-none">
          {cell.number}
        </span>
      )}
      {mode === 'play' && cell.answer && (
        <span className="text-xl md:text-2xl font-bold uppercase z-1 shrink-0">{cell.answer}</span>
      )}
    </div>
  )
})

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
                    onClick={() => onCellClick(rIndex, cIndex)}
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
