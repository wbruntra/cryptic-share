import { useState, useEffect, useRef } from 'react'
import { Socket } from 'socket.io-client'
import { Modal } from './Modal'
import { ClueExplanationDisplay, type ClueExplanation } from './ClueExplanationDisplay'

interface HintModalProps {
  isOpen: boolean
  onClose: () => void
  wordLength: number
  clue: string
  clueNumber: number | null
  direction: 'across' | 'down' | undefined
  currentWordState: string[] // The characters currently in the grid for this word
  onFetchAnswer: () => Promise<string>
  onFetchExplanation?: () => Promise<
    ClueExplanation | { processing: true; requestId: string; message: string }
  >
  onFetchCachedExplanation?: () => Promise<ClueExplanation | null>
  onReportExplanation?: (feedback?: string) => Promise<void>
  timerDisplay?: string
  socket?: Socket | null
}

type TabType = 'letters' | 'explain'

export function HintModal({
  isOpen,
  onClose,
  wordLength,
  clue,
  clueNumber,
  direction,
  currentWordState,
  onFetchAnswer,
  onFetchExplanation,
  onFetchCachedExplanation,
  onReportExplanation,
  timerDisplay,
  socket,
}: HintModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('letters')

  // Letters tab state
  const [modalState, setModalState] = useState<string[]>([''])
  const [fullAnswer, setFullAnswer] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Explain tab state
  const [explanation, setExplanation] = useState<ClueExplanation | null>(null)
  const [explanationLoading, setExplanationLoading] = useState(false)
  const [explanationError, setExplanationError] = useState<string | null>(null)
  const [requestId, setRequestId] = useState<string | null>(null)
  const [processingMessage, setProcessingMessage] = useState<string>('')
  const [reportLoading, setReportLoading] = useState(false)
  const [hasReported, setHasReported] = useState(false)

  // Use a ref to track the current requestId for the socket listener
  // This avoids race conditions where the listener closure has a stale requestId
  const requestIdRef = useRef<string | null>(null)

  // Keep ref in sync with state
  useEffect(() => {
    requestIdRef.current = requestId
  }, [requestId])

  // Listen for socket events for async explanation
  // Set up listener once when socket is available, not dependent on requestId
  useEffect(() => {
    if (!socket) return

    const handleExplanationReady = (data: any) => {
      console.log('[HintModal] Received explanation_ready event:', data)
      console.log('[HintModal] Current requestIdRef:', requestIdRef.current)

      // Check if this explanation is for our current request using the ref
      if (data.requestId === requestIdRef.current) {
        console.log('[HintModal] RequestId matches! Processing...')
        if (data.success && data.explanation) {
          setExplanation(data.explanation)
          setExplanationLoading(false)
          setRequestId(null)
        } else {
          setExplanationError(data.error || 'Failed to generate explanation')
          setExplanationLoading(false)
          setRequestId(null)
        }
      } else {
        console.log('[HintModal] RequestId mismatch, ignoring event')
      }
    }

    console.log('[HintModal] Setting up explanation_ready listener')
    socket.on('explanation_ready', handleExplanationReady)

    return () => {
      console.log('[HintModal] Removing explanation_ready listener')
      socket.off('explanation_ready', handleExplanationReady)
    }
  }, [socket]) // Only depend on socket, not requestId

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setModalState(currentWordState)
      setFullAnswer(null)
      setError(null)
      setLoading(true)
      setActiveTab('letters')

      // Reset explanation state
      setExplanation(null)
      setExplanationLoading(false)
      setExplanationError(null)
      setRequestId(null)
      setReportLoading(false)
      setHasReported(false)

      onFetchAnswer()
        .then((answer) => {
          setFullAnswer(answer)
        })
        .catch(() => {
          setError('Failed to load hint answer')
        })
        .finally(() => {
          setLoading(false)
        })
    }
  }, [isOpen, currentWordState, onFetchAnswer])

  // Auto-fetch cached explanation when explain tab is opened
  useEffect(() => {
    if (activeTab === 'explain' && !explanation && !explanationLoading && onFetchCachedExplanation) {
      setExplanationLoading(true)
      onFetchCachedExplanation()
        .then((cached) => {
          if (cached) {
            setExplanation(cached)
          }
        })
        .catch((error: unknown) => {
          console.log('[HintModal] No cached explanation available:', error)
          // Silently fail - user can still manually request
        })
        .finally(() => {
          setExplanationLoading(false)
        })
    }
  }, [activeTab, explanation, explanationLoading, onFetchCachedExplanation])

  const handleLetterHint = (index: number) => {
    if (!fullAnswer) return
    setModalState((prev) => {
      const newState = [...prev]
      newState[index] = fullAnswer[index]
      return newState
    })
  }

  const handleWordHint = () => {
    if (!fullAnswer) return
    setModalState(fullAnswer.split(''))
  }

  const handleFetchExplanation = async () => {
    if (!onFetchExplanation || explanation) return

    setExplanationLoading(true)
    setExplanationError(null)
    setProcessingMessage('Requesting explanation...')

    try {
      const result = await onFetchExplanation()
      console.log('[HintModal] Fetch explanation result:', result)

      // Check if it's a processing response (202 Accepted)
      if ('processing' in result && result.processing) {
        console.log('[HintModal] Got processing response, requestId:', result.requestId)
        setRequestId(result.requestId)
        setProcessingMessage(result.message || 'AI is thinking...')
        // Keep loading true, waiting for socket
      } else {
        // Immediate result (cached)
        setExplanation(result as ClueExplanation)
        setExplanationLoading(false)
      }
    } catch (error: unknown) {
      // Check if it's a 401 authentication error
      if (error && typeof error === 'object' && 'response' in error) {
        const axiosError = error as { response?: { status?: number } }
        if (axiosError.response?.status === 401) {
          setExplanationError('You must be registered and signed in to request new explanations.')
        } else {
          setExplanationError('Failed to load explanation. Please try again.')
        }
      } else {
        setExplanationError('Failed to load explanation. Please try again.')
      }
      setExplanationLoading(false)
    }
  }

  const handleReport = async (feedback?: string) => {
    if (!onReportExplanation || reportLoading || hasReported) return

    setReportLoading(true)
    try {
      await onReportExplanation(feedback)
      setHasReported(true)
    } catch (error) {
      console.error('[HintModal] Error reporting explanation:', error)
      alert('Failed to submit report. Please try again.')
    } finally {
      setReportLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Get a Hint">
      <div className="flex flex-col gap-4">
        {/* Clue Header */}
        <div className="text-center">
          <div className="flex justify-between items-center mb-1">
            <span className="text-sm font-bold text-primary">
              {clueNumber} {direction?.toUpperCase()}
            </span>
            {timerDisplay && (
              <span className="text-xs font-mono text-text-secondary bg-surface-highlight px-2 py-0.5 rounded border border-border">
                ⏱️ {timerDisplay}
              </span>
            )}
          </div>
          <h3 className="text-lg font-serif text-text">{clue}</h3>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-border pb-2">
          <button
            onClick={() => setActiveTab('letters')}
            className={`px-4 py-2 rounded-t-lg font-medium transition-colors ${
              activeTab === 'letters'
                ? 'bg-primary/10 text-primary border-b-2 border-primary'
                : 'text-text-secondary hover:text-text hover:bg-surface'
            }`}
          >
            🔤 Letters
          </button>
          {onFetchExplanation && (
            <button
              onClick={() => setActiveTab('explain')}
              className={`px-4 py-2 rounded-t-lg font-medium transition-colors ${
                activeTab === 'explain'
                  ? 'bg-primary/10 text-primary border-b-2 border-primary'
                  : 'text-text-secondary hover:text-text hover:bg-surface'
              }`}
            >
              📖 Explain
            </button>
          )}
        </div>

        {/* Tab Content */}
        {activeTab === 'letters' && (
          <div className="flex flex-col gap-4">
            {/* Word Boxes */}
            <div className="flex justify-center flex-wrap gap-2">
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

            <div className="flex flex-col gap-2">
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
                Hints revealed here are for your eyes only.
              </p>
            </div>
          </div>
        )}

        {activeTab === 'explain' && (
          <div className="flex flex-col gap-3">
            {/* Request Explanation Button */}
            {!explanation && !explanationLoading && (
              <div className="text-center py-4">
                <button
                  onClick={handleFetchExplanation}
                  className="px-6 py-3 bg-primary text-white font-bold rounded-lg hover:bg-primary/90 transition-colors"
                >
                  🧠 Get AI Explanation
                </button>
                <p className="text-xs text-text-secondary mt-2">
                  Uses AI to explain the wordplay. May take 20-30 seconds.
                </p>
              </div>
            )}

            {/* Loading State */}
            {explanationLoading && (
              <div className="text-center py-8">
                <div className="w-12 h-12 mx-auto border-4 border-primary/30 border-t-primary rounded-full animate-spin mb-4" />
                <p className="text-text-secondary font-medium">
                  {processingMessage || 'Analyzing clue...'}
                </p>
                <p className="text-xs text-text-secondary mt-1">This may take 20-30 seconds</p>
              </div>
            )}

            {/* Error State */}
            {explanationError && (
              <div className="text-center py-4">
                <p className="text-error mb-3">{explanationError}</p>
                <button
                  onClick={handleFetchExplanation}
                  className="px-4 py-2 bg-error/10 text-error font-medium rounded-lg hover:bg-error/20"
                >
                  Try Again
                </button>
              </div>
            )}

            {/* Explanation Display */}
            {explanation && (
              <ClueExplanationDisplay
                explanation={explanation}
                onReport={onReportExplanation ? handleReport : undefined}
                reportLoading={reportLoading}
                hasReported={hasReported}
              />
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end pt-3 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 text-text font-medium hover:bg-input-bg rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  )
}
