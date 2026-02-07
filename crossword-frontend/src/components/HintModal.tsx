import { useState, useEffect, useRef } from 'react'
import { Modal } from './Modal'
import { ClueExplanationDisplay, type ClueExplanation } from './ClueExplanationDisplay'
import {
  useGetCachedExplanationQuery,
  useRequestExplanationMutation,
  useReportExplanationMutation,
} from '../store/api/sessionApi'
import { useAppDispatch, useAppSelector } from '../store/hooks'
import { addPendingExplanation, clearLatestExplanation } from '../store/slices/sessionSlice'

interface HintModalProps {
  isOpen: boolean
  onClose: () => void
  sessionId: string
  wordLength: number
  clue: string
  clueNumber: number | null
  direction: 'across' | 'down' | undefined
  currentWordState: string[] // The characters currently in the grid for this word
  onFetchAnswer: () => Promise<string>
  timerDisplay?: string
}

type TabType = 'letters' | 'explain'

type HintModalContentProps = Omit<HintModalProps, 'isOpen'>

export function HintModal(props: HintModalProps) {
  if (!props.isOpen) return null

  const key = `${props.sessionId}-${props.clueNumber ?? 'na'}-${props.direction ?? 'na'}`
  return <HintModalContent key={key} {...props} />
}

function HintModalContent({
  onClose,
  sessionId,
  wordLength,
  clue,
  clueNumber,
  direction,
  currentWordState,
  onFetchAnswer,
  timerDisplay,
}: HintModalContentProps) {
  const dispatch = useAppDispatch()
  const [activeTab, setActiveTab] = useState<TabType>('letters')

  // Letters tab state
  const [modalState, setModalState] = useState<string[]>(() => currentWordState)
  const [fullAnswer, setFullAnswer] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // RTK Query hooks for explanations
  const shouldFetchCached =
    activeTab === 'explain' && clueNumber !== null && direction !== undefined
  const {
    data: cachedExplanation,
    isLoading: isCachedLoading,
    isFetching: isCachedFetching,
  } = useGetCachedExplanationQuery(
    {
      sessionId,
      clueNumber: clueNumber!,
      direction: direction!,
    },
    {
      skip: !shouldFetchCached,
    },
  )

  const [requestExplanation, { isLoading: isRequestLoading }] = useRequestExplanationMutation()
  const [reportExplanation, { isLoading: isReportLoading }] = useReportExplanationMutation()

  // Local state for explanation UI
  const [explanation, setExplanation] = useState<ClueExplanation | null>(null)
  const [explanationError, setExplanationError] = useState<string | null>(null)
  const [localProcessingMessage, setLocalProcessingMessage] = useState<string>('')
  const [hasReported, setHasReported] = useState(false)

  // Track pending async explanations
  const pendingExplanations = useAppSelector((state) => state.session.pendingExplanations)
  const latestExplanation = useAppSelector((state) => state.session.latestExplanation)
  const currentPendingKey = clueNumber !== null && direction ? `${clueNumber}-${direction}` : null
  const pendingExplanation = currentPendingKey ? pendingExplanations[currentPendingKey] : null
  const effectiveExplanation = explanation ?? cachedExplanation ?? null
  const processingMessage = pendingExplanation?.message ?? localProcessingMessage
  const showExplanationError = explanationError && !effectiveExplanation

  useEffect(() => {
    let isActive = true

    onFetchAnswer()
      .then((answer) => {
        if (!isActive) return
        setFullAnswer(answer)
      })
      .catch(() => {
        if (!isActive) return
        setError('Failed to load hint answer')
      })
      .finally(() => {
        if (!isActive) return
        setLoading(false)
      })

    return () => {
      isActive = false
    }
  }, [onFetchAnswer])

  // Use a ref to track the current clue for the socket listener
  const currentClueRef = useRef<{ clueNumber: number; direction: 'across' | 'down' } | null>(null)

  // Keep ref in sync
  useEffect(() => {
    if (clueNumber !== null && direction) {
      currentClueRef.current = { clueNumber, direction }
    }
  }, [clueNumber, direction])

  useEffect(() => {
    if (!latestExplanation) return
    if (
      currentClueRef.current &&
      latestExplanation.clueNumber === currentClueRef.current.clueNumber &&
      latestExplanation.direction === currentClueRef.current.direction
    ) {
      if (latestExplanation.explanation) {
        setExplanation(latestExplanation.explanation as unknown as ClueExplanation)
        setExplanationError(null)
        setLocalProcessingMessage('')
      } else if (latestExplanation.error) {
        setExplanationError(latestExplanation.error)
        setLocalProcessingMessage('')
      }

      dispatch(clearLatestExplanation())
    }
  }, [latestExplanation, dispatch])

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
    if (!clueNumber || !direction || effectiveExplanation) return

    setExplanationError(null)
    setLocalProcessingMessage('Requesting explanation...')

    try {
      const result = await requestExplanation({
        sessionId,
        clueNumber,
        direction,
      }).unwrap()

      // Check if it's a processing response (202 Accepted)
      if ('processing' in result && result.processing) {
        dispatch(
          addPendingExplanation({
            requestId: result.requestId,
            clueNumber,
            direction,
            message: result.message || 'AI is thinking...',
          }),
        )
        setLocalProcessingMessage(result.message || 'AI is thinking...')
      } else {
        // Immediate result (cached)
        setExplanation(result as ClueExplanation)
        setLocalProcessingMessage('')
      }
    } catch (error: unknown) {
      // Check if it's a 401 authentication error
      const errorStatus =
        typeof error === 'object' && error !== null && 'status' in error
          ? (error as { status?: number }).status
          : undefined

      if (errorStatus === 401) {
        setExplanationError('You must be registered and signed in to request new explanations.')
      } else {
        setExplanationError('Failed to load explanation. Please try again.')
      }
      setLocalProcessingMessage('')
    }
  }

  const handleReport = async (feedback?: string) => {
    if (!clueNumber || !direction || hasReported) return

    try {
      await reportExplanation({
        sessionId,
        clueNumber,
        direction,
        feedback,
      }).unwrap()
      setHasReported(true)
    } catch (error) {
      console.error('[HintModal] Error reporting explanation:', error)
      alert('Failed to submit report. Please try again.')
    }
  }

  return (
    <Modal isOpen={true} onClose={onClose} title="Get a Hint">
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
            {!effectiveExplanation &&
              !isCachedLoading &&
              !isRequestLoading &&
              !pendingExplanation &&
              !isCachedFetching && (
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
            {(isCachedLoading || isRequestLoading || pendingExplanation) && (
              <div className="text-center py-8">
                <div className="w-12 h-12 mx-auto border-4 border-primary/30 border-t-primary rounded-full animate-spin mb-4" />
                <p className="text-text-secondary font-medium">
                  {processingMessage || 'Analyzing clue...'}
                </p>
                <p className="text-xs text-text-secondary mt-1">This may take 20-30 seconds</p>
              </div>
            )}

            {/* Error State */}
            {showExplanationError && (
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
            {effectiveExplanation && (
              <ClueExplanationDisplay
                explanation={effectiveExplanation}
                onReport={handleReport}
                reportLoading={isReportLoading}
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
