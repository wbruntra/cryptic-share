import { useState, useEffect, useCallback, useContext, useRef } from 'react'
import { SocketContext } from '../context/SocketContext'
import { Link } from 'react-router-dom'
import axios from 'axios'

interface Report {
  id: number
  puzzle_id: number
  clue_number: number
  direction: string
  feedback: string
  reported_at: string
  answer: string
  clue_text: string
}

interface Explanation {
  clue_type: string
  explanation: any
}

export function ReportManagementPage() {
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedReport, setSelectedReport] = useState<Report | null>(null)
  const [regenerating, setRegenerating] = useState(false)
  const [newExplanation, setNewExplanation] = useState<Explanation | null>(null)
  const [processingMessage, setProcessingMessage] = useState<string>('')
  const [saving, setSaving] = useState(false)

  // Request ID for current operation
  const [requestId, setRequestId] = useState<string | null>(null)
  const requestIdRef = useRef<string | null>(null)

  // Sync ref
  useEffect(() => {
    requestIdRef.current = requestId
  }, [requestId])

  const { socket, socketId } = useContext(SocketContext)

  // Listen for socket events
  useEffect(() => {
    if (!socket) return

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
      } else if (!data.success) {
        alert('Failed to regenerate: ' + data.error)
        setRegenerating(false)
        setProcessingMessage('')
        setRequestId(null)
      }
    }

    socket.on('admin_explanation_ready', handleExplanationReady)

    return () => {
      socket.off('admin_explanation_ready', handleExplanationReady)
    }
  }, [socket])

  const fetchReports = useCallback(() => {
    setLoading(true)
    axios
      .get('/api/admin/reports')
      .then((res) => setReports(res.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetchReports()
  }, [fetchReports])

  const handleRegenerate = async () => {
    if (!selectedReport) return

    setRegenerating(true)
    setNewExplanation(null)
    setProcessingMessage('Starting regeneration...')
    setRequestId(null) // Clear previous ID

    try {
      const res = await axios.post('/api/admin/explanations/regenerate', {
        clue: selectedReport.clue_text,
        answer: selectedReport.answer,
        feedback: selectedReport.feedback,
        socketId: socketId, // Send socket ID for async processing
      })

      if (res.data.processing) {
        setProcessingMessage(res.data.message)
        if (res.data.requestId) {
          setRequestId(res.data.requestId)
        }
        // Keep regenerating true, wait for socket event
      } else {
        // Fallback or immediate response
        setNewExplanation(res.data)
        setRegenerating(false)
      }
    } catch (error) {
      console.error('Failed to regenerate:', error)
      alert('Failed to regenerate explanation')
      setRegenerating(false)
    }
  }

  const handleSave = async () => {
    if (!selectedReport || !newExplanation) return

    setSaving(true)
    try {
      await axios.post('/api/admin/explanations/save', {
        puzzleId: selectedReport.puzzle_id,
        clueNumber: selectedReport.clue_number,
        direction: selectedReport.direction,
        clueText: selectedReport.clue_text,
        answer: selectedReport.answer,
        explanation: newExplanation,
      })

      alert('Explanation saved and reports resolved.')
      setSelectedReport(null)
      setNewExplanation(null)
      fetchReports() // Refresh list
    } catch (error) {
      console.error('Failed to save:', error)
      alert('Failed to save explanation')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 pb-12">
      <header className="mb-10 pt-8 pb-6 border-b border-border">
        <Link to="/admin" className="text-primary hover:underline mb-2 inline-block">
          &larr; Back to Dashboard
        </Link>
        <h1 className="text-3xl font-bold text-text italic tracking-tight">Manage Reports</h1>
        <p className="text-text-secondary text-sm">
          Review and resolve user feedback on explanations.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Reports List */}
        <div className="lg:col-span-1 bg-surface rounded-xl shadow-lg border border-border overflow-hidden flex flex-col h-[calc(100vh-250px)]">
          <div className="p-4 border-b border-border bg-input-bg/50">
            <h2 className="font-bold text-lg text-text">Pending Reports ({reports.length})</h2>
          </div>
          <div className="overflow-y-auto flex-1 p-2 space-y-2">
            {loading ? (
              <div className="p-4 text-center text-text-secondary">Loading...</div>
            ) : reports.length === 0 ? (
              <div className="p-8 text-center text-text-secondary italic">No pending reports.</div>
            ) : (
              reports.map((report) => (
                <div
                  key={report.id}
                  onClick={() => {
                    setSelectedReport(report)
                    setNewExplanation(null)
                  }}
                  className={`p-4 rounded-lg cursor-pointer border transition-all ${
                    selectedReport?.id === report.id
                      ? 'bg-primary/10 border-primary'
                      : 'bg-input-bg border-border hover:border-primary/50'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-xs font-mono bg-surface px-2 py-0.5 rounded border border-border">
                      #{report.puzzle_id} | {report.clue_number}
                      {report.direction}
                    </span>
                    <span className="text-xs text-text-secondary">
                      {new Date(report.reported_at).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="font-bold text-text mb-1">{report.answer}</div>
                  <div className="text-sm text-text-secondary line-clamp-2">
                    "{report.feedback}"
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Selected Report Consular */}
        <div className="lg:col-span-2 space-y-6">
          {selectedReport ? (
            <>
              <div className="bg-surface rounded-xl p-6 shadow-lg border border-border">
                <h2 className="text-xl font-bold mb-4 text-text border-l-4 border-primary pl-4">
                  Report Details
                </h2>
                <div className="space-y-4">
                  <div>
                    <span className="block text-sm font-semibold text-text-secondary uppercase tracking-wider">
                      Clue
                    </span>
                    <p className="text-lg text-text font-serif bg-input-bg p-3 rounded-lg border border-border">
                      {selectedReport.clue_text}
                    </p>
                  </div>
                  <div>
                    <span className="block text-sm font-semibold text-text-secondary uppercase tracking-wider">
                      Answer
                    </span>
                    <p className="text-lg text-text font-mono font-bold tracking-widest bg-input-bg p-3 rounded-lg border border-border inline-block">
                      {selectedReport.answer}
                    </p>
                  </div>
                  <div>
                    <span className="block text-sm font-semibold text-text-secondary uppercase tracking-wider">
                      User Feedback
                    </span>
                    <p className="text-md text-error bg-error/5 p-3 rounded-lg border border-error/20 italic">
                      "{selectedReport.feedback}"
                    </p>
                  </div>
                </div>

                <div className="mt-8 pt-6 border-t border-border flex gap-4">
                  <button
                    onClick={handleRegenerate}
                    disabled={regenerating}
                    className="flex-1 py-3 px-6 rounded-xl bg-primary text-white font-bold shadow-md hover:bg-primary-hover active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed border-none cursor-pointer"
                  >
                    {regenerating ? (
                      <span className="flex items-center justify-center gap-2">
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        {processingMessage || 'Regenerating...'}
                      </span>
                    ) : (
                      '✨ Regenerate Explanation'
                    )}
                  </button>
                </div>
              </div>

              {newExplanation && (
                <div className="bg-surface rounded-xl p-6 shadow-lg border border-border animate-fade-in-up">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-text border-l-4 border-accent pl-4">
                      Generated Explanation
                    </h2>
                    <span className="text-xs font-mono bg-accent/10 text-accent px-2 py-1 rounded border border-accent/20">
                      {newExplanation.clue_type}
                    </span>
                  </div>

                  <div className="bg-input-bg/50 p-4 rounded-xl border border-border font-mono text-sm overflow-x-auto mb-6">
                    <pre>{JSON.stringify(newExplanation, null, 2)}</pre>
                  </div>

                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="w-full py-3 px-6 rounded-xl bg-green-600 text-white font-bold shadow-md hover:bg-green-700 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed border-none cursor-pointer"
                  >
                    {saving ? 'Saving...' : '✅ Approve & Save'}
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="h-full flex items-center justify-center bg-surface rounded-xl border-2 border-dashed border-border text-text-secondary italic">
              Select a report to view details.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
