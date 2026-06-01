import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { ParsewordsGame } from './parsewords/ParsewordsGame'
import type { Puzzle } from './parsewords/types'

interface ParsewordsEntry {
  id: number
  clueNumber: number
  direction: 'across' | 'down'
  clueText: string | null
  answer: string | null
  puzzle: Puzzle
}

interface ParsewordsModalProps {
  isOpen: boolean
  onClose: () => void
  puzzleId: number
  onFillAnswer?: (clueNumber: number, direction: 'across' | 'down', answer: string) => void
}

export function ParsewordsModal({ isOpen, onClose, puzzleId, onFillAnswer }: ParsewordsModalProps) {
  const [entries, setEntries] = useState<ParsewordsEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<ParsewordsEntry | null>(null)
  const [wonEntryIds, setWonEntryIds] = useState<Set<number>>(new Set())

  useEffect(() => {
    if (!isOpen) return
    setLoading(true)
    fetch(`/api/parsewords/puzzle/${puzzleId}`)
      .then((r) => r.json())
      .then((data: ParsewordsEntry[]) => {
        setEntries(data)
        if (data.length > 0 && !selected) {
          setSelected(data[0])
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, puzzleId])

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = 'unset'
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const label = (entry: ParsewordsEntry) =>
    `${entry.clueNumber} ${entry.direction.charAt(0).toUpperCase() + entry.direction.slice(1)}`

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-2xl min-h-[500px] max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
          <h2 className="text-xl font-bold text-text">Parsewords Puzzles</h2>
          <button
            onClick={onClose}
            className="text-text-secondary hover:text-text transition-colors p-1"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center p-12 text-text-secondary gap-2">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            Loading…
          </div>
        ) : entries.length === 0 ? (
          <div className="p-8 text-center text-text-secondary">
            No Parsewords puzzles available for this puzzle yet.
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row flex-1 min-h-0">
            {/* Clue list sidebar */}
            <div className="sm:w-44 shrink-0 border-b sm:border-b-0 sm:border-r border-border overflow-y-auto">
              <div className="p-2 space-y-1">
                {entries.map((entry) => (
                  <button
                    key={entry.id}
                    onClick={() => setSelected(entry)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                      selected?.id === entry.id
                        ? 'bg-primary text-white font-semibold'
                        : 'text-text hover:bg-surface-hover'
                    }`}
                  >
                    <span className="font-medium flex items-center gap-1.5">
                      {label(entry)}
                      {wonEntryIds.has(entry.id) && <span className="text-green-500">✓</span>}
                    </span>
                    {entry.clueText && (
                      <span className="block text-xs mt-0.5 opacity-70 truncate">{entry.clueText}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Game area */}
            <div className="flex-1 overflow-y-auto p-6 min-h-0">
              {selected ? (
                <div className="space-y-4">
                  <div className="text-xs font-bold tracking-widest text-text-secondary uppercase">
                    {label(selected)}
                  </div>
                  <ParsewordsGame
                    key={selected.id}
                    puzzle={selected.puzzle}
                    onWin={() => setWonEntryIds((prev) => new Set(prev).add(selected.id))}
                  />
                  {wonEntryIds.has(selected.id) && onFillAnswer && (
                    <button
                      onClick={() => {
                        onFillAnswer(selected.clueNumber, selected.direction, selected.puzzle.answer)
                        onClose()
                      }}
                      className="mt-2 w-full py-2 px-4 rounded-lg bg-green-600 hover:bg-green-500 text-white font-semibold transition-colors"
                    >
                      Fill in puzzle
                    </button>
                  )}
                </div>
              ) : (
                <div className="text-text-secondary text-sm">Select a clue to play.</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
