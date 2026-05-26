import { useState, useEffect, useRef } from 'react'
import { Link, useParams } from 'react-router-dom'
import axios from 'axios'
import { useAppDispatch, useAppSelector } from '../store/hooks'
import { fetchClueExplanations } from '../store/slices/adminSlice'
import type { ClueExplanation } from '../store/slices/adminSlice'

interface NewExplanation {
  clue_type: string
  explanation: Record<string, unknown>
}

const CLUE_TYPE_STYLES: Record<string, { label: string; bg: string; text: string; border: string }> = {
  wordplay:           { label: 'wordplay',        bg: 'bg-blue-500/10',   text: 'text-blue-500',   border: 'border-blue-500/20' },
  double_definition:  { label: 'double def',      bg: 'bg-purple-500/10', text: 'text-purple-500', border: 'border-purple-500/20' },
  '&lit':             { label: '&lit',             bg: 'bg-amber-500/10',  text: 'text-amber-500',  border: 'border-amber-500/20' },
  cryptic_definition: { label: 'cryptic def',     bg: 'bg-teal-500/10',   text: 'text-teal-500',   border: 'border-teal-500/20' },
  no_clean_parse:     { label: 'no clean parse',  bg: 'bg-error/10',      text: 'text-error',      border: 'border-error/20' },
}

interface WordplayStep {
  tokens: string[]
  operation: string
  result: string
  clue_after: string
}

function WordplaySteps({ steps }: { steps: WordplayStep[] }) {
  return (
    <div className="space-y-2">
      {steps.map((step, i) => (
        <div key={i} className="flex items-start gap-3 text-xs">
          {/* Step number */}
          <span className="shrink-0 w-5 h-5 rounded-full bg-input-bg text-text-secondary flex items-center justify-center font-bold mt-0.5">
            {i + 1}
          </span>

          <div className="flex-1 min-w-0 space-y-1">
            {/* Tokens + operation + result */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {step.tokens.map((t, j) => (
                <span key={j} className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 font-mono font-medium border border-amber-500/25">
                  {t}
                </span>
              ))}
              <span className="text-text-secondary">→ {step.operation} →</span>
              <span className="px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-500 font-mono font-bold border border-blue-500/25">
                {step.result}
              </span>
            </div>
            {/* clue_after */}
            <div className="text-text-secondary font-mono truncate pl-0.5" title={step.clue_after}>
              {step.clue_after}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function ClueTypeBadge({ clueType }: { clueType: string }) {
  const s = CLUE_TYPE_STYLES[clueType] ?? { label: clueType, bg: 'bg-input-bg', text: 'text-text-secondary', border: 'border-border' }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${s.bg} ${s.text} ${s.border} whitespace-nowrap`}>
      {s.label}
    </span>
  )
}

export function ExplanationReviewPage() {
  const { id } = useParams<{ id: string }>()
  const dispatch = useAppDispatch()
  const { clueExplanations, explanationStatus } = useAppSelector((state) => state.admin)

  const [expandedClue, setExpandedClue] = useState<string | null>(null) // "number-direction"
  const [regenerating, setRegenerating] = useState(false)
  const [newExplanation, setNewExplanation] = useState<NewExplanation | null>(null)
  const [editedJson, setEditedJson] = useState<Record<string, string>>({}) // key -> edited JSON text
  const [editJsonError, setEditJsonError] = useState<Record<string, string>>({})
  const [savingEdit, setSavingEdit] = useState<string | null>(null)

  // Regenerate with notes modal
  const [showRegenModal, setShowRegenModal] = useState(false)
  const [regenNotes, setRegenNotes] = useState('')
  const [regenTargetClue, setRegenTargetClue] = useState<ClueExplanation | null>(null)

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

  const handleRegenerate = async (clue: ClueExplanation, notes: string) => {
    setRegenerating(true)
    setNewExplanation(null)
    setProcessingMessage('Starting regeneration...')
    setRequestId(null)

    try {
      const currentExp = JSON.parse(clue.explanation_json)
      const res = await axios.post('/api/admin/explanations/regenerate', {
        clue: clue.clue_text,
        answer: clue.answer,
        feedback: notes.trim() || 'Admin manual regeneration',
        previousExplanation: currentExp,
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

  const handleSaveEdit = async (clue: ClueExplanation) => {
    const key = `${clue.clue_number}-${clue.direction}`
    const text = editedJson[key]
    if (!text) return

    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      setEditJsonError((prev) => ({ ...prev, [key]: 'Invalid JSON — fix before saving.' }))
      return
    }

    setSavingEdit(key)
    try {
      await axios.post('/api/admin/explanations/save', {
        puzzleId: clue.puzzle_id,
        clueNumber: clue.clue_number,
        direction: clue.direction,
        clueText: clue.clue_text,
        answer: clue.answer,
        explanation: parsed,
      })
      setEditedJson((prev) => { const n = { ...prev }; delete n[key]; return n })
      setEditJsonError((prev) => { const n = { ...prev }; delete n[key]; return n })
      if (id) dispatch(fetchClueExplanations(id))
    } catch (error) {
      console.error('Failed to save:', error)
      setEditJsonError((prev) => ({ ...prev, [key]: 'Save failed. Check console.' }))
    } finally {
      setSavingEdit(null)
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

      {explanationStatus === 'succeeded' && clueExplanations.length > 0 && (() => {
        const counts: Record<string, number> = {}
        for (const c of clueExplanations) {
          try {
            const t = JSON.parse(c.explanation_json)?.clue_type ?? 'unknown'
            counts[t] = (counts[t] ?? 0) + 1
          } catch { counts['unknown'] = (counts['unknown'] ?? 0) + 1 }
        }
        return (
          <div className="flex flex-wrap gap-2 mb-6">
            {Object.entries(counts).sort(([,a],[,b]) => b - a).map(([type, count]) => (
              <span key={type} className="flex items-center gap-1.5">
                <ClueTypeBadge clueType={type} />
                <span className="text-xs text-text-secondary font-mono">{count}</span>
              </span>
            ))}
            <span className="text-xs text-text-secondary self-center ml-1">
              — {clueExplanations.length} total
            </span>
          </div>
        )
      })()}

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
                  <th className="px-6 py-4 text-left text-sm font-bold text-text">Type</th>
                  <th className="px-6 py-4 text-left text-sm font-bold text-text">Status</th>
                  <th className="px-6 py-4 text-right text-sm font-bold text-text">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {clueExplanations.map((clue) => {
                  const key = `${clue.clue_number}-${clue.direction}`
                  const isExpanded = expandedClue === key
                  const hasReports = clue.pending_reports > 0
                  const parsedExp = (() => { try { return JSON.parse(clue.explanation_json) } catch { return null } })()
                  const clueType: string = parsedExp?.clue_type ?? 'unknown'
                  const wordplaySteps: WordplayStep[] | null = (() => {
                    const steps = parsedExp?.wordplay_steps
                    if (Array.isArray(steps) && Array.isArray(steps[0]?.tokens)) return steps
                    return null
                  })()

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
                          <ClueTypeBadge clueType={clueType} />
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
                                {wordplaySteps && (
                                  <div className="mb-5">
                                    <h4 className="font-bold text-sm text-text-secondary uppercase tracking-wider mb-3">
                                      Steps
                                    </h4>
                                    <div className="bg-surface rounded-lg border border-border p-4">
                                      <WordplaySteps steps={wordplaySteps} />
                                    </div>
                                  </div>
                                )}
                                <h4 className="font-bold text-sm text-text-secondary uppercase tracking-wider mb-2">
                                  {wordplaySteps ? 'Raw JSON' : 'Current Explanation'}
                                </h4>
                                <div className={`bg-surface p-4 rounded-lg border ${editedJson[key] !== undefined ? 'border-primary/60' : 'border-border'}`}>
                                  <textarea
                                    className="w-full min-h-[400px] text-xs font-mono bg-transparent border-none outline-none resize-y focus:outline-none"
                                    value={editedJson[key] ?? JSON.stringify(JSON.parse(clue.explanation_json), null, 2)}
                                    onChange={(e) => {
                                      setEditedJson((prev) => ({ ...prev, [key]: e.target.value }))
                                      setEditJsonError((prev) => { const n = { ...prev }; delete n[key]; return n })
                                    }}
                                    spellCheck={false}
                                  />
                                </div>
                                {editJsonError[key] && (
                                  <p className="mt-1 text-xs text-error">{editJsonError[key]}</p>
                                )}
                                <div className="mt-4 flex gap-2 flex-wrap">
                                  <button
                                    onClick={() => handleSaveEdit(clue)}
                                    disabled={savingEdit === key || editedJson[key] === undefined}
                                    className="px-4 py-2 bg-green-600 text-white rounded-lg shadow hover:bg-green-700 disabled:opacity-40 text-sm font-bold flex-1"
                                  >
                                    {savingEdit === key ? 'Saving...' : 'Save Edits'}
                                  </button>
                                  {editedJson[key] !== undefined && (
                                    <button
                                      onClick={() => {
                                        setEditedJson((prev) => { const n = { ...prev }; delete n[key]; return n })
                                        setEditJsonError((prev) => { const n = { ...prev }; delete n[key]; return n })
                                      }}
                                      className="px-3 py-2 text-sm text-text-secondary border border-border rounded-lg hover:text-text transition-colors"
                                    >
                                      Discard
                                    </button>
                                  )}
                                  <button
                                    onClick={() => {
                                      setRegenTargetClue(clue)
                                      setRegenNotes('')
                                      setShowRegenModal(true)
                                    }}
                                    disabled={regenerating}
                                    className="px-4 py-2 bg-primary text-white rounded-lg shadow hover:bg-primary-hover disabled:opacity-50 text-sm font-bold flex-1"
                                  >
                                    {regenerating && regenTargetClue?.clue_number === clue.clue_number && regenTargetClue?.direction === clue.direction ? (
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
      {showRegenModal && regenTargetClue && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-surface border border-border rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-text mb-1">Regenerate Explanation</h3>
            <p className="text-xs text-text-secondary font-mono mb-4">
              {regenTargetClue.clue_number}{regenTargetClue.direction.charAt(0).toUpperCase()} — {regenTargetClue.answer}
            </p>
            <p className="text-sm text-text-secondary mb-2">
              Describe what's wrong (optional — leave blank to regenerate fresh):
            </p>
            <textarea
              value={regenNotes}
              onChange={(e) => setRegenNotes(e.target.value)}
              placeholder="e.g., The indicator 'about' should signal a container, not a charade..."
              className="w-full h-28 px-3 py-2 bg-input-bg border border-border rounded-lg text-text placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-primary resize-none text-sm"
              autoFocus
            />
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => { setShowRegenModal(false); setRegenTargetClue(null) }}
                className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text rounded transition-colors border-none cursor-pointer bg-transparent"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowRegenModal(false)
                  handleRegenerate(regenTargetClue, regenNotes)
                }}
                className="px-4 py-2 text-sm font-medium bg-primary text-white rounded hover:bg-primary-hover transition-colors border-none cursor-pointer"
              >
                Regenerate
              </button>
            </div>
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
