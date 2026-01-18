import { useState, useEffect } from 'react'
import { Modal } from './Modal'

interface HintModalProps {
  isOpen: boolean
  onClose: () => void
  wordLength: number
  clue: string
  clueNumber: number | null
  direction: 'across' | 'down' | undefined
  currentWordState: string[] // The characters currently in the grid for this word
  onHintRequest: (type: 'letter' | 'word', index?: number) => Promise<string>
}

export function HintModal({
  isOpen,
  onClose,
  wordLength,
  clue,
  clueNumber,
  direction,
  currentWordState,
  onHintRequest,
}: HintModalProps) {
  const [modalState, setModalState] = useState<string[]>([''])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Initialize modal state from current grid state when opened
  useEffect(() => {
    if (isOpen) {
      setModalState(currentWordState)
      setError(null)
    }
  }, [isOpen, currentWordState])

  const handleLetterHint = async (index: number) => {
    setLoading(true)
    setError(null)
    try {
      const char = await onHintRequest('letter', index)
      setModalState((prev) => {
        const newState = [...prev]
        newState[index] = char
        return newState
      })
    } catch (err) {
      setError('Failed to get hint')
    } finally {
      setLoading(false)
    }
  }

  const handleWordHint = async () => {
    setLoading(true)
    setError(null)
    try {
      const word = await onHintRequest('word')
      setModalState(word.split(''))
    } catch (err) {
      setError('Failed to get word hint')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Get a Hint">
      <div className="flex flex-col gap-6">
        <div className="text-center">
          <div className="text-sm font-bold text-primary mb-1">
            {clueNumber} {direction?.toUpperCase()}
          </div>
          <h3 className="text-xl font-serif text-text mb-4">{clue}</h3>
        </div>

        {/* Word Boxes */}
        <div className="flex justify-center flex-wrap gap-2 mb-4">
          {Array.from({ length: wordLength }).map((_, index) => (
            <button
              key={index}
              onClick={() => handleLetterHint(index)}
              disabled={loading}
              className={`w-10 h-10 sm:w-12 sm:h-12 border-2 flex items-center justify-center text-xl font-bold rounded-lg transition-all ${
                modalState[index]?.trim()
                  ? 'bg-primary/10 border-primary text-primary'
                  : 'bg-surface border-border text-text hover:border-primary/50'
              }`}
              title="Click for single letter hint"
            >
              {loading && !modalState[index]?.trim() ? (
                <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              ) : (
                modalState[index] || ''
              )}
            </button>
          ))}
        </div>

        {error && <div className="text-error text-center text-sm">{error}</div>}

        <div className="flex flex-col gap-3">
          <button
            onClick={handleWordHint}
            disabled={loading}
            className="w-full py-3 bg-secondary/10 text-secondary font-bold rounded-lg hover:bg-secondary/20 transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              '🔍 Reveal Whole Word'
            )}
          </button>
          <p className="text-xs text-center text-text-secondary">
            Hints revealed here are for your eyes only and will not update the main puzzle.
          </p>
        </div>

        <div className="flex justify-end pt-4 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 text-text font-medium hover:bg-input-bg rounded-lg transition-colors"
          >
            Close & Fill Manually
          </button>
        </div>
      </div>
    </Modal>
  )
}
