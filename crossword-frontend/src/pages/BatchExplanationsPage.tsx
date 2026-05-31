import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  LuCpu,
  LuHistory,
  LuCheck,
  LuLoader,
  LuRefreshCw,
  LuPlay,
  LuTriangleAlert,
  LuArrowLeft,
  LuSparkles,
  LuInfo,
} from 'react-icons/lu'
import axios from 'axios'

interface PuzzleBatchStatus {
  id: number
  title: string
  book: string | null
  puzzle_number: number | null
  total_clues: number
  explained_clues: number
  remaining: number
  active_batch: {
    batch_id: string
    status: string
    created_at: string
  } | null
}

interface BatchHistoryItem {
  id: number
  batch_id: string
  puzzle_id: number
  status: string
  input_file_id: string
  output_file_id: string | null
  created_at: string
  updated_at: string
  applied_at: string | null
  puzzle_title: string
  puzzle_number: number | null
}

export function BatchExplanationsPage() {
  const [puzzles, setPuzzles] = useState<PuzzleBatchStatus[]>([])
  const [history, setHistory] = useState<BatchHistoryItem[]>([])
  const [loadingPuzzles, setLoadingPuzzles] = useState(true)
  const [loadingHistory, setLoadingHistory] = useState(true)
  
  // Actions loading states
  const [actionLoading, setActionLoading] = useState<string | null>(null) // holds batchId or puzzleId being processed
  const [activeTab, setActiveTab] = useState<'puzzles' | 'history'>('puzzles')
  
  // Create Batch Modal State
  const [selectedPuzzle, setSelectedPuzzle] = useState<PuzzleBatchStatus | null>(null)
  const [forceRegen, setForceRegen] = useState(false)
  const [createLoading, setCreateLoading] = useState(false)
  
  // Message notification state
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const showNotification = (type: 'success' | 'error', text: string) => {
    setNotification({ type, text })
    setTimeout(() => setNotification(null), 5000)
  }

  const fetchPuzzlesStatus = async () => {
    setLoadingPuzzles(true)
    try {
      const token = localStorage.getItem('token')
      const res = await axios.get('/api/admin/explanations/batches/puzzles', {
        headers: { Authorization: `Bearer ${token}` },
      })
      setPuzzles(res.data)
    } catch (err: any) {
      console.error(err)
      showNotification('error', 'Failed to fetch puzzles explanation status.')
    } finally {
      setLoadingPuzzles(false)
    }
  }

  // Backwards compat with catch
  const fetchPuzzlesStatusSafe = async () => {
    setLoadingPuzzles(true)
    try {
      const token = localStorage.getItem('token')
      const res = await axios.get('/api/admin/explanations/batches/puzzles', {
        headers: { Authorization: `Bearer ${token}` },
      })
      setPuzzles(res.data)
    } catch (err: any) {
      console.error(err)
      showNotification('error', 'Failed to fetch puzzles explanation status.')
    } finally {
      setLoadingPuzzles(false)
    }
  }

  const fetchHistory = async () => {
    setLoadingHistory(true)
    try {
      const token = localStorage.getItem('token')
      const res = await axios.get('/api/admin/explanations/batches/history', {
        headers: { Authorization: `Bearer ${token}` },
      })
      setHistory(res.data)
    } catch (err: any) {
      console.error(err)
      showNotification('error', 'Failed to fetch batch job history.')
    } finally {
      setLoadingHistory(false)
    }
  }

  useEffect(() => {
    fetchPuzzlesStatusSafe()
    fetchHistory()
  }, [])

  const handleCreateBatch = async () => {
    if (!selectedPuzzle) return
    setCreateLoading(true)
    try {
      const token = localStorage.getItem('token')
      const res = await axios.post(
        '/api/admin/explanations/batches/create',
        { puzzleId: selectedPuzzle.id, force: forceRegen },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      
      if (res.data.batchId) {
        showNotification('success', `Batch created successfully! ID: ${res.data.batchId}`)
      } else {
        showNotification('success', res.data.message || 'No new clues needed explanation.')
      }
      setSelectedPuzzle(null)
      setForceRegen(false)
      fetchPuzzlesStatusSafe()
      fetchHistory()
    } catch (err: any) {
      console.error(err)
      showNotification('error', err.response?.data?.message || 'Failed to create batch job.')
    } finally {
      setCreateLoading(false)
    }
  }

  const handleCheckStatus = async (batchId: string) => {
    setActionLoading(batchId)
    try {
      const token = localStorage.getItem('token')
      const res = await axios.post(
        `/api/admin/explanations/batches/status/${batchId}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      )
      showNotification('success', `Batch status refreshed: ${res.data.status}`)
      fetchHistory()
      fetchPuzzlesStatusSafe()
    } catch (err: any) {
      console.error(err)
      showNotification('error', 'Failed to check batch status.')
    } finally {
      setActionLoading(null)
    }
  }

  const handleApplyResults = async (batchId: string) => {
    setActionLoading(batchId)
    try {
      const token = localStorage.getItem('token')
      const res = await axios.post(
        `/api/admin/explanations/batches/apply/${batchId}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      )
      
      if (res.data.success) {
        showNotification(
          'success',
          `Successfully applied explanations! Saved: ${res.data.saved}, Failed: ${res.data.failed}, Invalid: ${res.data.validation_failed}`
        )
      } else {
        showNotification('error', res.data.message || 'Failed to apply results.')
      }
      fetchHistory()
      fetchPuzzlesStatusSafe()
    } catch (err: any) {
      console.error(err)
      showNotification('error', err.response?.data?.message || 'Failed to apply batch results.')
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 pb-12">
      {/* Toast Notification */}
      {notification && (
        <div className={`fixed top-20 right-8 z-50 p-4 rounded-xl shadow-2xl border transition-all duration-300 transform scale-100 flex items-center gap-3 animate-fade-in ${
          notification.type === 'success'
            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
            : 'bg-red-500/10 text-red-400 border-red-500/30'
        }`}>
          {notification.type === 'success' ? <LuCheck size={20} /> : <LuTriangleAlert size={20} />}
          <span className="font-medium text-sm text-text">{notification.text}</span>
        </div>
      )}

      {/* Header */}
      <header className="mb-8 border-b border-border pb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Link to="/admin" className="text-text-secondary hover:text-text transition-colors">
              <LuArrowLeft size={20} />
            </Link>
            <span className="text-xs font-bold bg-primary/10 text-primary px-2 py-0.5 rounded uppercase tracking-wider">
              Automation
            </span>
          </div>
          <h1 className="text-3xl font-bold text-text italic tracking-tight flex items-center gap-2">
            <LuCpu className="text-primary" /> Batch Explanations
          </h1>
          <p className="text-text-secondary text-sm mt-1">
            Manage OpenAI batch jobs to generate high-quality cryptic crossword clue explanations.
          </p>
        </div>

        {/* Navigation Tabs */}
        <div className="flex bg-surface-highlight p-1 rounded-xl border border-border">
          <button
            onClick={() => setActiveTab('puzzles')}
            className={`px-4 py-2 rounded-lg font-bold text-sm transition-all border-none cursor-pointer flex items-center gap-2 ${
              activeTab === 'puzzles'
                ? 'bg-surface text-primary shadow-sm'
                : 'text-text-secondary hover:text-text bg-transparent'
            }`}
          >
            <LuSparkles size={16} /> Puzzles Status
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 rounded-lg font-bold text-sm transition-all border-none cursor-pointer flex items-center gap-2 ${
              activeTab === 'history'
                ? 'bg-surface text-primary shadow-sm'
                : 'text-text-secondary hover:text-text bg-transparent'
            }`}
          >
            <LuHistory size={16} /> Job History
          </button>
        </div>
      </header>

      {/* Tab Contents: Puzzles */}
      {activeTab === 'puzzles' && (
        <section>
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-text border-l-4 border-primary pl-3">
              Puzzle Explanation Status
            </h2>
            <button
              onClick={fetchPuzzlesStatusSafe}
              disabled={loadingPuzzles}
              className="p-2 bg-surface hover:bg-surface-highlight text-text-secondary hover:text-text rounded-xl border border-border transition-colors cursor-pointer disabled:opacity-50"
              title="Refresh status"
            >
              <LuRefreshCw className={`w-5 h-5 ${loadingPuzzles ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {loadingPuzzles ? (
            <div className="flex items-center justify-center min-h-[30vh] text-text-secondary gap-2">
              <LuLoader className="animate-spin text-primary" size={24} />
              Loading puzzles explanation status...
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {puzzles.map((p) => {
                const isComplete = p.remaining === 0
                const percent = Math.round((p.explained_clues / p.total_clues) * 100) || 0

                return (
                  <div
                    key={p.id}
                    className={`bg-surface border rounded-2xl p-6 shadow-md transition-all duration-300 relative overflow-hidden ${
                      isComplete
                        ? 'border-emerald-500/20 hover:border-emerald-500/40'
                        : p.active_batch
                        ? 'border-amber-500/20 hover:border-amber-500/40'
                        : 'border-border hover:border-primary'
                    }`}
                  >
                    {/* Corner badge for fully complete */}
                    {isComplete && (
                      <div className="absolute top-0 right-0 bg-emerald-500/10 text-emerald-500 text-xs font-bold px-3 py-1 rounded-bl-xl border-l border-b border-emerald-500/20 flex items-center gap-1">
                        <LuCheck size={12} /> Complete
                      </div>
                    )}

                    <div className="pr-12">
                      <span className="text-xs font-bold text-text-secondary opacity-60">
                        Book {p.book || '—'} • Puzzle #{p.puzzle_number || '—'}
                      </span>
                      <h3 className="text-lg font-bold text-text mt-1 truncate" title={p.title}>
                        {p.title}
                      </h3>
                    </div>

                    {/* Progress Bar */}
                    <div className="mt-4">
                      <div className="flex justify-between text-xs font-bold text-text-secondary mb-1">
                        <span>Explanations</span>
                        <span>
                          {p.explained_clues}/{p.total_clues} ({percent}%)
                        </span>
                      </div>
                      <div className="w-full bg-surface-highlight rounded-full h-2.5 overflow-hidden border border-border/50">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            isComplete ? 'bg-emerald-500' : 'bg-primary'
                          }`}
                          style={{ width: `${percent}%` }}
                        ></div>
                      </div>
                    </div>

                    {/* Active batch info */}
                    {p.active_batch && (
                      <div className="mt-4 p-3 bg-amber-500/5 border border-amber-500/10 rounded-xl text-xs flex flex-col gap-1">
                        <span className="font-semibold text-amber-500 flex items-center gap-1">
                          <LuLoader size={12} className="animate-spin" /> Active Batch Running
                        </span>
                        <span className="text-text-secondary truncate">
                          ID: <span className="font-mono">{p.active_batch.batch_id}</span>
                        </span>
                        <span className="text-text-secondary">
                          Status: <span className="font-bold uppercase text-amber-500/80">{p.active_batch.status}</span>
                        </span>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="mt-6 flex gap-2">
                      {!p.active_batch && (
                        <button
                          onClick={() => setSelectedPuzzle(p)}
                          className="flex-1 py-2.5 px-4 rounded-xl bg-primary text-white font-bold text-sm shadow hover:bg-primary-hover active:scale-95 transition-all border-none cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          <LuPlay size={16} /> Prepare Batch
                        </button>
                      )}
                      
                      {p.active_batch && (
                        <button
                          onClick={() => handleCheckStatus(p.active_batch!.batch_id)}
                          disabled={actionLoading === p.active_batch.batch_id}
                          className="flex-1 py-2.5 px-4 rounded-xl bg-surface border border-border text-text font-bold text-sm shadow-sm hover:bg-surface-highlight active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                        >
                          {actionLoading === p.active_batch.batch_id ? (
                            <LuLoader size={16} className="animate-spin text-amber-500" />
                          ) : (
                            <LuRefreshCw size={16} className="text-amber-500" />
                          )}
                          Refresh Status
                        </button>
                      )}

                      <Link
                        to={`/admin/puzzles/${p.id}/explanations`}
                        className="py-2.5 px-4 rounded-xl bg-surface-highlight border border-border text-text hover:text-primary hover:border-primary font-semibold text-sm shadow-sm transition-all text-center no-underline flex items-center justify-center gap-1"
                      >
                        Review
                      </Link>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}

      {/* Tab Contents: History */}
      {activeTab === 'history' && (
        <section>
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-text border-l-4 border-primary pl-3">
              Batch Job History
            </h2>
            <button
              onClick={fetchHistory}
              disabled={loadingHistory}
              className="p-2 bg-surface hover:bg-surface-highlight text-text-secondary hover:text-text rounded-xl border border-border transition-colors cursor-pointer disabled:opacity-50"
              title="Refresh history"
            >
              <LuRefreshCw className={`w-5 h-5 ${loadingHistory ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {loadingHistory ? (
            <div className="flex items-center justify-center min-h-[30vh] text-text-secondary gap-2">
              <LuLoader className="animate-spin text-primary" size={24} />
              Loading batch history...
            </div>
          ) : (
            <div className="bg-surface border border-border rounded-2xl shadow-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-surface-highlight border-b border-border">
                      <th className="p-4 text-xs font-bold text-text-secondary uppercase">Puzzle</th>
                      <th className="p-4 text-xs font-bold text-text-secondary uppercase">Batch ID</th>
                      <th className="p-4 text-xs font-bold text-text-secondary uppercase">Status</th>
                      <th className="p-4 text-xs font-bold text-text-secondary uppercase">Created</th>
                      <th className="p-4 text-xs font-bold text-text-secondary uppercase">Applied</th>
                      <th className="p-4 text-xs font-bold text-text-secondary uppercase text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((b) => {
                      const isApplied = b.applied_at !== null
                      const createdDate = new Date(b.created_at).toLocaleString()
                      const appliedDate = b.applied_at ? new Date(b.applied_at).toLocaleString() : null

                      let statusBadge = ''
                      switch (b.status) {
                        case 'completed':
                          statusBadge = 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                          break
                        case 'pending':
                        case 'in_progress':
                          statusBadge = 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                          break
                        case 'failed':
                          statusBadge = 'bg-red-500/10 text-red-500 border border-red-500/20'
                          break
                        default:
                          statusBadge = 'bg-surface-highlight text-text-secondary border border-border'
                      }

                      return (
                        <tr key={b.id} className="border-b border-border hover:bg-surface-highlight/20 transition-colors">
                          <td className="p-4 font-bold text-sm text-text">
                            <span className="text-xs text-text-secondary opacity-60 mr-1.5">
                              P#{b.puzzle_number || '?'}
                            </span>
                            {b.puzzle_title}
                          </td>
                          <td className="p-4 font-mono text-xs text-text-secondary select-all">
                            {b.batch_id}
                          </td>
                          <td className="p-4">
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${statusBadge}`}>
                              {b.status}
                            </span>
                          </td>
                          <td className="p-4 text-xs text-text-secondary">{createdDate}</td>
                          <td className="p-4 text-xs text-text-secondary">
                            {isApplied ? (
                              <span className="text-emerald-500 font-semibold">{appliedDate}</span>
                            ) : (
                              <span className="italic opacity-50">Not applied</span>
                            )}
                          </td>
                          <td className="p-4 text-right">
                            <div className="flex justify-end gap-2">
                              {/* Refresh Status button */}
                              {b.status !== 'completed' && b.status !== 'failed' && (
                                <button
                                  onClick={() => handleCheckStatus(b.batch_id)}
                                  disabled={actionLoading === b.batch_id}
                                  className="p-2 bg-surface hover:bg-surface-highlight text-text rounded border border-border shadow-sm active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-1 disabled:opacity-50"
                                  title="Refresh status"
                                >
                                  {actionLoading === b.batch_id ? (
                                    <LuLoader className="animate-spin text-amber-500" size={14} />
                                  ) : (
                                    <LuRefreshCw className="text-amber-500" size={14} />
                                  )}
                                </button>
                              )}

                              {/* Apply results button */}
                              {b.status === 'completed' && !isApplied && (
                                <button
                                  onClick={() => handleApplyResults(b.batch_id)}
                                  disabled={actionLoading === b.batch_id}
                                  className="px-3 py-1.5 bg-emerald-500 text-white hover:bg-emerald-600 rounded-xl font-bold text-xs shadow hover:shadow-md active:scale-95 transition-all border-none cursor-pointer flex items-center gap-1 disabled:opacity-50"
                                >
                                  {actionLoading === b.batch_id ? (
                                    <LuLoader className="animate-spin" size={14} />
                                  ) : (
                                    <LuCheck size={14} />
                                  )}
                                  Apply Results
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                    {history.length === 0 && (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-text-secondary italic">
                          No batch explanation history found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Prepare Batch Modal */}
      {selectedPuzzle && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4 animate-fade-in">
          <div className="bg-bg border border-border rounded-3xl shadow-2xl max-w-lg w-full p-8 transform scale-100 transition-all duration-300">
            <h3 className="text-2xl font-bold text-text mb-2 italic tracking-tight flex items-center gap-2">
              <LuCpu className="text-primary animate-pulse" /> Launch Batch Job
            </h3>
            <p className="text-sm text-text-secondary mb-6">
              You are about to launch an OpenAI batch explanation job for:
            </p>

            <div className="p-4 bg-surface-highlight border border-border rounded-2xl mb-6">
              <span className="text-xs font-semibold text-text-secondary opacity-60">
                Book {selectedPuzzle.book || '—'} • Puzzle #{selectedPuzzle.puzzle_number || '—'}
              </span>
              <h4 className="text-lg font-bold text-text mt-1">{selectedPuzzle.title}</h4>
              <div className="flex gap-4 mt-3 text-xs text-text-secondary">
                <span>Total Clues: <strong>{selectedPuzzle.total_clues}</strong></span>
                <span>Explained: <strong>{selectedPuzzle.explained_clues}</strong></span>
                <span>Remaining: <strong className="text-primary">{selectedPuzzle.remaining}</strong></span>
              </div>
            </div>

            {selectedPuzzle.remaining === 0 && !forceRegen && (
              <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-2xl text-xs text-amber-500 leading-relaxed mb-4 flex gap-2.5">
                <LuTriangleAlert size={16} className="shrink-0 mt-0.5" />
                <span>
                  This puzzle is already fully explained. You <strong>must</strong> check the "Force explanation regeneration" option below to trigger a new batch job.
                </span>
              </div>
            )}

            {/* Checkbox for force regen */}
            <label className="flex items-start gap-3 p-4 bg-surface/40 border border-border rounded-2xl cursor-pointer hover:bg-surface/80 transition-colors select-none mb-6">
              <input
                type="checkbox"
                checked={forceRegen}
                onChange={(e) => setForceRegen(e.target.checked)}
                className="mt-0.5 w-4 h-4 text-primary bg-input-bg border-border rounded focus:ring-primary focus:ring-offset-bg outline-none"
              />
              <div>
                <span className="text-sm font-bold text-text block">Force explanation regeneration</span>
                <span className="text-xs text-text-secondary mt-0.5 block leading-relaxed">
                  Normally, batch jobs only target clues lacking explanations. Checking this will regenerate explanation steps for clues already possessing old-format explanations, backfilling them with the new role-segmentation steps.
                </span>
              </div>
            </label>

            {/* Warning info */}
            <div className="bg-blue-500/5 border border-blue-500/10 p-4 rounded-2xl text-xs text-text-secondary leading-relaxed mb-8 flex gap-2.5">
              <LuInfo size={16} className="text-blue-400 shrink-0 mt-0.5" />
              <span>
                <strong>Note:</strong> Creating a batch explanation typically takes <strong>1–24 hours</strong> for OpenAI to complete. You will be able to review and apply the results from the Job History dashboard once done.
              </span>
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setSelectedPuzzle(null)
                  setForceRegen(false)
                }}
                disabled={createLoading}
                className="px-5 py-3 text-sm font-bold text-text-secondary hover:text-text rounded-xl bg-transparent border-none transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateBatch}
                disabled={createLoading || (selectedPuzzle.remaining === 0 && !forceRegen)}
                className="px-6 py-3 bg-primary text-white hover:bg-primary-hover rounded-xl font-bold text-sm shadow-md active:scale-95 transition-all border-none cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {createLoading && <LuLoader size={16} className="animate-spin" />}
                Launch Batch
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
