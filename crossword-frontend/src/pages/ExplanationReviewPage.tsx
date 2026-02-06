import { useState, useEffect, useRef } from 'react'
import { useSocket } from '../context/SocketContext'
import { Link, useParams } from 'react-router-dom'
import axios from 'axios'
import { useAppDispatch, useAppSelector } from '../store/hooks'
import { fetchClueExplanations } from '../store/slices/adminSlice'
import type { ClueExplanation } from '../store/slices/adminSlice'

interface NewExplanation {
  clue_type: string
  explanation: any
}

export function ExplanationReviewPage() {
  const { id } = useParams<{ id: string }>()
  const dispatch = useAppDispatch()
  const { clueExplanations, explanationStatus } = useAppSelector((state) => state.admin)

  const [expandedClue, setExpandedClue] = useState<string | null>(null) // "number-direction"
  const [regenerating, setRegenerating] = useState(false)
  const [newExplanation, setNewExplanation] = useState<NewExplanation | null>(null)

  // Report State
  const [showReportModal, setShowReportModal] = useState(false)
  const [reportFeedback, setReportFeedback] = useState('')
  const [reportingClue, setReportingClue] = useState<ClueExplanation | null>(null)
  const [isReporting, setIsReporting] = useState(false)
  const [processingMessage, setProcessingMessage] = useState<string>('')

  // Request ID for current operation
  const [requestId, setRequestId] = useState<string | null>(null)
  const requestIdRef = useRef<string | null>(null)
  const storageKey = id
    ? `adminExplanationReviewRegeneration:${id}`
    : 'adminExplanationReviewRegeneration'

  // Sync ref
  useEffect(() => {
    requestIdRef.current = requestId
  }, [requestId])

  useEffect(() => {
    const storedValue = localStorage.getItem(storageKey)
    if (!storedValue || requestId) return

    try {
      const parsed = JSON.parse(storedValue)
      if (parsed?.requestId) {
        setRequestId(parsed.requestId)
        if (parsed.clueKey) {
          setExpandedClue(parsed.clueKey)
        }
      }
    } catch {
      setRequestId(storedValue)
    }

    setRegenerating(true)
    setProcessingMessage('Checking regeneration status...')
  }, [storageKey, requestId])

  const { on, off, socketId } = useSocket()

  // Listen for socket events
  useEffect(() => {
    const handleExplanationReady = (data: any) => {
      // Check if this explanation matches our current request
      if (data.requestId && data.requestId !== requestIdRef.current) {
        return // Ignore events for other requests
      }

      if (data.success && data.explanation) {
        setNewExplanation(data.explanation)
        setRegenerating(false)
        setProcessingMessage('')
        setRequestId(null)
        localStorage.removeItem(storageKey)
      } else if (!data.success) {
        alert('Failed to regenerate: ' + data.error)
        setRegenerating(false)
        setProcessingMessage('')
        setRequestId(null)
        localStorage.removeItem(storageKey)
      }
    }

    on('admin_explanation_ready', handleExplanationReady)

    return () => {
      off('admin_explanation_ready', handleExplanationReady)
    }
  }, [on, off, storageKey])

  useEffect(() => {
    if (id) {
      dispatch(fetchClueExplanations(id))
    }
  }, [dispatch, id])

  useEffect(() => {
    if (!requestId) return

    let isActive = true

    const pollStatus = async () => {
      try {
        const res = await axios.get(`/api/admin/explanations/regenerate/${requestId}`)
        if (!isActive) return

        if (res.data.status === 'success' && res.data.explanation) {
          setNewExplanation(res.data.explanation)
          setRegenerating(false)
          setProcessingMessage('')
          setRequestId(null)
          localStorage.removeItem(storageKey)
        } else if (res.data.status === 'error') {
          alert('Failed to regenerate: ' + (res.data.error || 'Unknown error'))
          setRegenerating(false)
          setProcessingMessage('')
          setRequestId(null)
          localStorage.removeItem(storageKey)
        } else {
          setProcessingMessage(res.data.message || 'Regeneration in progress...')
        }
      } catch (error) {
        if (!isActive) return
      }
    }

    pollStatus()
    const interval = setInterval(pollStatus, 4000)

    return () => {
      isActive = false
      clearInterval(interval)
    }
  }, [requestId, storageKey])

  const handleRegenerate = async (clue: ClueExplanation) => {
    setRegenerating(true)
    setNewExplanation(null)
    setProcessingMessage('Starting regeneration...')
    setRequestId(null) // Clear previous ID

    try {
      const currentExp = JSON.parse(clue.explanation_json)
      const res = await axios.post('/api/admin/explanations/regenerate', {
        clue: clue.clue_text,
        answer: clue.answer,
        feedback: 'Admin manual regeneration',
        previousExplanation: currentExp,
        socketId: socketId, // Send socket ID for async processing
      })

      if (res.data.processing) {
        setProcessingMessage(res.data.message)
        if (res.data.requestId) {
          setRequestId(res.data.requestId)
          localStorage.setItem(
            storageKey,
            JSON.stringify({
              requestId: res.data.requestId,
              clueKey: `${clue.clue_number}-${clue.direction}`,
            }),
          )
        }
        // Keep regenerating true, wait for socket event
      } else {
        setNewExplanation(res.data)
        setRegenerating(false)
        localStorage.removeItem(storageKey)
      }
    } catch (error) {
      console.error('Failed to regenerate:', error)
      alert('Failed to regenerate explanation')
      setRegenerating(false)
      localStorage.removeItem(storageKey)
    }
  }

  const handleSave = async (clue: ClueExplanation) => {
    if (!newExplanation) return

    try {
      await axios.post('/api/admin/explanations/save', {
        puzzleId: clue.puzzle_id,
        clueNumber: clue.clue_number,
        direction: clue.direction,
        clueText: clue.clue_text,
        answer: clue.answer,
        explanation: newExplanation,
      })

      alert('Explanation saved.')
      setNewExplanation(null)
      if (id) dispatch(fetchClueExplanations(id))
    } catch (error) {
      console.error('Failed to save:', error)
      alert('Failed to save explanation')
    }
  }

  const handleReport = async () => {
    if (!reportingClue) return

    setIsReporting(true)
    try {
      await axios.post('/api/admin/reports', {
        puzzleId: reportingClue.puzzle_id,
        clueNumber: reportingClue.clue_number,
        direction: reportingClue.direction,
        feedback: reportFeedback || 'Manual admin report',
      })

      alert('Report filed successfully.')
      setShowReportModal(false)
      setReportFeedback('')
      setReportingClue(null)
      if (id) dispatch(fetchClueExplanations(id))
    } catch (error) {
      console.error('Failed to report:', error)
      alert('Failed to file report')
    } finally {
      setIsReporting(false)
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 pb-12">
      <header className="mb-10 pt-8 pb-6 border-b border-border">
        <Link to="/admin" className="text-primary hover:underline mb-2 inline-block">
          &larr; Back to Dashboard
        </Link>
        <h1 className="text-3xl font-bold text-text italic tracking-tight">
          Review Explanations: Puzzle #{id}
        </h1>
      </header>

      {explanationStatus === 'loading' ? (
        <div className="flex justify-center p-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : (
        <div className="bg-surface rounded-xl shadow-lg border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-input-bg border-b border-border">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-bold text-text">Clue</th>
                  <th className="px-6 py-4 text-left text-sm font-bold text-text">Answer</th>
                  <th className="px-6 py-4 text-left text-sm font-bold text-text">Status</th>
                  <th className="px-6 py-4 text-right text-sm font-bold text-text">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {clueExplanations.map((clue) => {
                  const key = `${clue.clue_number}-${clue.direction}`
                  const isExpanded = expandedClue === key
                  const hasReports = clue.pending_reports > 0

                  return (
                    <>
                      <tr
                        key={key}
                        className={`hover:bg-input-bg/30 transition-colors ${
                          isExpanded ? 'bg-input-bg/50' : ''
                        }`}
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-primary">
                              {clue.clue_number}
                              {clue.direction.charAt(0).toUpperCase()}
                            </span>
                            <span className="text-text">{clue.clue_text}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 font-mono text-text font-bold uppercase">
                          {clue.answer}
                        </td>
                        <td className="px-6 py-4">
                          {hasReports ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-error/10 text-error border border-error/20">
                              {clue.pending_reports} Reports
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-500/10 text-green-600 border border-green-500/20">
                              OK
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => setExpandedClue(isExpanded ? null : key)}
                            className="text-primary hover:text-primary-hover font-bold text-sm"
                          >
                            {isExpanded ? 'Hide' : 'View'}
                          </button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td
                            colSpan={4}
                            className="px-6 py-6 bg-input-bg/30 border-b border-border"
                          >
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              <div>
                                <h4 className="font-bold text-sm text-text-secondary uppercase tracking-wider mb-2">
                                  Current Explanation
                                </h4>
                                <div className="bg-surface p-4 rounded-lg border border-border">
                                  <textarea
                                    readOnly
                                    className="w-full min-h-[400px] text-xs font-mono bg-transparent border-none outline-none resize-y"
                                    value={JSON.stringify(
                                      JSON.parse(clue.explanation_json),
                                      null,
                                      2,
                                    )}
                                  />
                                </div>
                                <div className="mt-4 flex gap-2">
                                  <button
                                    onClick={() => handleRegenerate(clue)}
                                    disabled={regenerating}
                                    className="px-4 py-2 bg-primary text-white rounded-lg shadow hover:bg-primary-hover disabled:opacity-50 text-sm font-bold flex-1"
                                  >
                                    {regenerating ? (
                                      <span className="flex items-center justify-center gap-2">
                                        <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                        {processingMessage || 'Regenerating...'}
                                      </span>
                                    ) : (
                                      'Regenerate'
                                    )}
                                  </button>
                                  <button
                                    onClick={() => {
                                      setReportingClue(clue)
                                      setShowReportModal(true)
                                    }}
                                    className="px-4 py-2 bg-error/10 text-error border border-error/20 rounded-lg hover:bg-error/20 text-sm font-bold"
                                  >
                                    Report Issue
                                  </button>
                                </div>
                              </div>

                              {newExplanation && (
                                <div className="animate-fade-in">
                                  <h4 className="font-bold text-sm text-primary uppercase tracking-wider mb-2">
                                    New Proposed Explanation
                                  </h4>
                                  <div className="bg-surface p-4 rounded-lg border border-primary/50 font-mono text-xs overflow-auto max-h-64 shadow-inner">
                                    <pre>{JSON.stringify(newExplanation, null, 2)}</pre>
                                  </div>
                                  <div className="mt-4">
                                    <button
                                      onClick={() => handleSave(clue)}
                                      className="px-4 py-2 bg-green-600 text-white rounded-lg shadow hover:bg-green-700 text-sm font-bold w-full"
                                    >
                                      Approve & Save
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {showReportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-surface border border-border rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-text mb-3">Report Explanation Issue</h3>
            <p className="text-sm text-text-secondary mb-4">
              Describe the issue with this explanation:
            </p>
            <textarea
              value={reportFeedback}
              onChange={(e) => setReportFeedback(e.target.value)}
              placeholder="e.g., The wordplay explanation is incorrect..."
              className="w-full h-32 px-3 py-2 bg-input-bg border border-border rounded-lg text-text placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              autoFocus
            />
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => {
                  setShowReportModal(false)
                  setReportFeedback('')
                  setReportingClue(null)
                }}
                className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text rounded transition-colors border-none cursor-pointer bg-transparent"
              >
                Cancel
              </button>
              <button
                onClick={handleReport}
                disabled={isReporting || !reportFeedback.trim()}
                className="px-4 py-2 text-sm font-medium bg-red-500 text-white rounded hover:bg-red-600 transition-colors border-none cursor-pointer disabled:opacity-50"
              >
                {isReporting ? 'Submitting...' : 'Submit Report'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
