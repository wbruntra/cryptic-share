import React, { memo } from 'react'
import type { RenderedCell, Mode } from '@/types'
import { getAttributionBackground, getAttributionBorder } from './utils/attributionColors'

export interface GridCellProps {
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
  onCellClick: (r: number, c: number) => void
}

// Memoized cell component to prevent unnecessary re-renders
export const GridCell = memo(function GridCell({
  cell,
  r,
  c,
  mode,
  isChanged,
  isError,
  isCorrectFlash,
  isIncorrectFlash,
  attribution,
  showAttributions,
  onCellClick,
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
      key={`${r}-${c}`}
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
      onClick={() => onCellClick(r, c)}
      role="gridcell"
      tabIndex={isBlack ? -1 : 0}
      aria-label={isBlack ? 'Black square' : `Cell${cell.number ? `, Clue ${cell.number}` : ''}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onCellClick(r, c)
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
