import { useEffect, useRef, useState, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import axios from 'axios'
import { useGetPuzzlesQuery } from '../store/api/adminApi'
import type { Puzzle } from '../components/parsewords/types'
import { ParsewordsBuilder } from '../components/parsewords/ParsewordsBuilder'
import { AdminChatPanel } from '../components/AdminChatPanel'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WordplayStep {
  tokens: string
  operation: string
  result: string
  clue_after: string
}

interface FlatExplanation {
  clue_type: string
  full_explanation: string
  wordplay_steps?: WordplayStep[]
  definition?: string
  definitions?: Array<{ definition: string; sense: string }>
}

interface ClueSummary {
  explanationId: number
  clueNumber: number
  direction: string
  clueText: string
  answer: string
  explanation: FlatExplanation | { clue_type: string; explanation: FlatExplanation }
  parsewordsId: number | null
  puzzle: unknown | null
  parsewordsUpdatedAt: string | null
}

function getFlatExplanation(raw: ClueSummary['explanation']): FlatExplanation {
  return 'explanation' in raw ? raw.explanation : raw
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ParsewordsAdminPage() {
  const { data: puzzles = [], isLoading: puzzlesLoading } = useGetPuzzlesQuery()

  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedPuzzleId, setSelectedPuzzleId] = useState<number | null>(
    () => { const p = searchParams.get('puzzle'); return p ? Number(p) : null }
  )
  const [clues, setClues] = useState<ClueSummary[]>([])
  const [cluesLoading, setCluesLoading] = useState(false)

  const [selectedClue, setSelectedClue] = useState<ClueSummary | null>(null)
  const [builderPuzzle, setBuilderPuzzle] = useState<Puzzle | null>(null)
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [generatingError, setGeneratingError] = useState<string>('')
  const [saveMessage, setSaveMessage] = useState<string>('')

  const [showExplanation, setShowExplanation] = useState(false)

  const [modelKeys, setModelKeys] = useState<string[]>([])
  const [selectedModel, setSelectedModel] = useState<string>('deepseek-pro')
  const [generatingElapsed, setGeneratingElapsed] = useState(0)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Fetch available models once
  useEffect(() => {
    axios.get('/api/parsewords/admin/models')
      .then((r) => {
        setModelKeys(r.data)
        if (!r.data.includes('deepseek-pro')) setSelectedModel(r.data[0] ?? '')
      })
      .catch(console.error)
  }, [])

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
      if (elapsedRef.current) clearInterval(elapsedRef.current)
    }
  }, [])

  function selectPuzzle(id: number | null) {
    setSelectedPuzzleId(id)
    setSearchParams(id ? { puzzle: String(id) } : {}, { replace: true })
  }

  // Load clues when puzzle is selected
  useEffect(() => {
    if (!selectedPuzzleId) return
    setClues([])
    setSelectedClue(null)
    setBuilderPuzzle(null)
    setCluesLoading(true)
    axios
      .get(`/api/parsewords/admin/clues/${selectedPuzzleId}`)
      .then((r) => setClues(r.data))
      .catch(console.error)
      .finally(() => setCluesLoading(false))
  }, [selectedPuzzleId])

  // When a clue is selected, pre-populate the editor with any existing puzzle
  function selectClue(clue: ClueSummary) {
    setSelectedClue(clue)
    setBuilderPuzzle(clue.puzzle as Puzzle | null)
    setGeneratingError('')
    setSaveMessage('')
    setShowExplanation(false)
  }

  function stopPolling() {
    if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null }
    if (elapsedRef.current) { clearInterval(elapsedRef.current); elapsedRef.current = null }
    setGenerating(false)
    setGeneratingElapsed(0)
  }

  async function generate() {
    if (!selectedPuzzleId || !selectedClue) return
    setGenerating(true)
    setGeneratingElapsed(0)
    setGeneratingError('')
    setSaveMessage('')
    setBuilderPuzzle(null)

    let requestId: string
    try {
      const { data } = await axios.post('/api/parsewords/admin/generate', {
        puzzleId: selectedPuzzleId,
        clueNumber: selectedClue.clueNumber,
        direction: selectedClue.direction,
        modelKey: selectedModel,
      })
      requestId = data.requestId
    } catch (e: any) {
      setGeneratingError(e?.response?.data?.message ?? 'Generation failed')
      setGenerating(false)
      return
    }

    // Start elapsed timer
    const startTime = Date.now()
    elapsedRef.current = setInterval(() => {
      setGeneratingElapsed(Math.floor((Date.now() - startTime) / 1000))
    }, 1000)

    // Poll for result
    pollingRef.current = setInterval(async () => {
      try {
        const { data } = await axios.get(`/api/parsewords/admin/generate/${requestId}`)
        if (data.status === 'success') {
          stopPolling()
          setBuilderPuzzle(data.puzzle as Puzzle)
        } else if (data.status === 'error') {
          stopPolling()
          setGeneratingError(data.message ?? 'Generation failed')
        }
        // 'pending' → keep polling
      } catch (e: any) {
        stopPolling()
        setGeneratingError(e?.response?.data?.message ?? 'Failed to check generation status')
      }
    }, 4000)
  }

  const handleBuilderChange = useCallback((puzzle: Puzzle) => {
    setBuilderPuzzle(puzzle)
  }, [])

  async function save() {
    if (!selectedPuzzleId || !selectedClue || !builderPuzzle) return
    setSaving(true)
    setGeneratingError('')
    try {
      await axios.post('/api/parsewords/admin/save', {
        puzzleId: selectedPuzzleId,
        clueNumber: selectedClue.clueNumber,
        direction: selectedClue.direction,
        puzzle: builderPuzzle,
      })
      setSaveMessage('Saved!')
      // Update clue in list to show saved status
      setClues((prev) =>
        prev.map((c) =>
          c.clueNumber === selectedClue.clueNumber && c.direction === selectedClue.direction
            ? { ...c, puzzle: builderPuzzle, parsewordsId: c.parsewordsId ?? -1, parsewordsUpdatedAt: new Date().toISOString() }
            : c,
        ),
      )
      setSelectedClue((prev) =>
        prev ? { ...prev, puzzle: builderPuzzle, parsewordsId: prev.parsewordsId ?? -1 } : prev,
      )
    } catch (e: any) {
      setGeneratingError(e?.response?.data?.message ?? 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 pb-12">
      <header className="mb-8 pt-8 pb-6 border-b border-border flex items-center justify-between">
        <div>
          <Link to="/admin" className="text-primary hover:underline text-sm mb-1 inline-block">
            &larr; Back to Dashboard
          </Link>
          <h1 className="text-3xl font-bold text-text italic tracking-tight">
            Parsewords Puzzle Builder
          </h1>
          <p className="text-text-secondary text-sm mt-1">
            Generate and review interactive puzzle definitions from clue explanations.
          </p>
        </div>
        <Link
          to="/parsewords-test"
          target="_blank"
          className="px-4 py-2 rounded-lg border border-border text-text-secondary text-sm hover:text-text hover:border-text transition-colors no-underline"
        >
          Open game &rarr;
        </Link>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_320px] gap-6">
        {/* ── Left panel: puzzle + clue selector ── */}
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold tracking-widest text-text-secondary uppercase mb-2">
              Puzzle
            </label>
            {puzzlesLoading ? (
              <div className="h-10 bg-input-bg rounded-lg animate-pulse" />
            ) : (
              <select
                value={selectedPuzzleId ?? ''}
                onChange={(e) => selectPuzzle(Number(e.target.value) || null)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-input-bg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Select a puzzle…</option>
                {puzzles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            )}
          </div>

          {selectedPuzzleId && (
            <div>
              <label className="block text-xs font-bold tracking-widest text-text-secondary uppercase mb-2">
                Clues with explanations
                {clues.length > 0 && (
                  <span className="ml-2 normal-case font-normal text-text-secondary">
                    ({clues.filter((c) => c.parsewordsId).length}/{clues.length} have puzzles)
                  </span>
                )}
              </label>
              {cluesLoading ? (
                <div className="space-y-1">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-9 bg-input-bg rounded animate-pulse" />
                  ))}
                </div>
              ) : (
                <div className="space-y-1 max-h-[60vh] overflow-y-auto pr-1">
                  {clues.map((clue) => {
                    const key = `${clue.clueNumber}-${clue.direction}`
                    const isSelected =
                      selectedClue?.clueNumber === clue.clueNumber &&
                      selectedClue?.direction === clue.direction
                    return (
                      <button
                        key={key}
                        onClick={() => selectClue(clue)}
                        className="w-full text-left px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer border"
                        style={
                          isSelected
                            ? { background: 'var(--color-primary)', color: '#fff', borderColor: 'var(--color-primary)' }
                            : { background: 'var(--color-surface)', color: 'var(--color-text)', borderColor: 'var(--color-border)' }
                        }
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-bold text-xs">
                            {clue.clueNumber}{clue.direction.charAt(0).toUpperCase()}
                          </span>
                          {clue.parsewordsId ? (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/20 text-green-600 border border-green-500/30">
                              saved
                            </span>
                          ) : (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-input-bg text-text-secondary border border-border">
                              —
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 truncate text-xs opacity-80">{clue.answer}</div>
                      </button>
                    )
                  })}
                  {clues.length === 0 && (
                    <p className="text-sm text-text-secondary italic px-2">
                      No explanations found for this puzzle.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Right panel: builder ── */}
        {selectedClue ? (
          <div className="space-y-4">
            {/* Clue info + action bar */}
            <div className="bg-surface rounded-xl border border-border p-4">
              <div className="flex items-baseline gap-3 mb-3">
                <span className="font-mono font-bold text-primary">
                  {selectedClue.clueNumber}{selectedClue.direction.charAt(0).toUpperCase()}
                </span>
                <span className="text-text">{selectedClue.clueText}</span>
                <span className="font-mono font-bold text-text ml-auto">{selectedClue.answer.toUpperCase()}</span>
                <button
                  onClick={() => setShowExplanation((v) => !v)}
                  className={`shrink-0 px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                    showExplanation
                      ? 'bg-primary text-white border-primary'
                      : 'border-border text-text-secondary hover:text-text hover:border-text-secondary'
                  }`}
                >
                  Explanation
                </button>
              </div>

              {showExplanation && (() => {
                const exp = getFlatExplanation(selectedClue.explanation)
                return (
                  <div className="mb-3 p-3 rounded-lg bg-input-bg border border-border space-y-3 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-primary/15 text-primary text-xs font-mono font-bold">
                        {exp.clue_type}
                      </span>
                    </div>

                    {exp.wordplay_steps && exp.wordplay_steps.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="text-[10px] font-bold tracking-widest text-text-secondary uppercase">Steps</div>
                        {exp.wordplay_steps.map((step, i) => (
                          <div key={i} className="grid grid-cols-[auto_1fr_auto] gap-x-3 gap-y-0.5 items-baseline text-xs font-mono">
                            <span className="text-text-secondary">{i + 1}.</span>
                            <span>
                              <span className="text-amber-500 font-bold">{step.tokens}</span>
                              {' '}
                              <span className="text-text-secondary italic">({step.operation})</span>
                              {' → '}
                              <span className="text-green-500 font-bold">{step.result}</span>
                            </span>
                            {step.clue_after && (
                              <span className="text-text-secondary text-[10px]">→ "{step.clue_after}"</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {exp.definitions && (
                      <div className="space-y-1">
                        <div className="text-[10px] font-bold tracking-widest text-text-secondary uppercase">Definitions</div>
                        {exp.definitions.map((d, i) => (
                          <div key={i} className="text-xs">
                            <span className="font-bold text-amber-500">{d.definition}</span>
                            {' — '}
                            <span className="text-text-secondary italic">{d.sense}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="space-y-1">
                      <div className="text-[10px] font-bold tracking-widest text-text-secondary uppercase">Explanation</div>
                      <p className="text-text leading-relaxed">{exp.full_explanation}</p>
                    </div>
                  </div>
                )
              })()}

              <div className="flex items-center gap-3 flex-wrap">
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  disabled={generating || modelKeys.length === 0}
                  className="px-3 py-2 rounded-lg border border-border bg-input-bg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                >
                  {modelKeys.map((key) => (
                    <option key={key} value={key}>{key}</option>
                  ))}
                </select>

                <button
                  onClick={generate}
                  disabled={generating}
                  className="px-5 py-2 rounded-lg bg-primary text-white font-bold text-sm hover:bg-primary-hover disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {generating ? (
                    <span className="flex items-center gap-2">
                      <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
                      {generatingElapsed > 0 ? `Generating… ${generatingElapsed}s` : 'Generating…'}
                    </span>
                  ) : selectedClue.parsewordsId ? 'Regenerate' : 'Generate'}
                </button>

                <button
                  onClick={save}
                  disabled={saving || !builderPuzzle}
                  className="px-5 py-2 rounded-lg bg-green-600 text-white font-bold text-sm hover:bg-green-700 disabled:opacity-40 transition-colors cursor-pointer"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>

                {saveMessage && (
                  <span className="text-sm text-green-600 font-medium">{saveMessage}</span>
                )}
                {generatingError && (
                  <span className="text-sm text-red-500 font-medium">{generatingError}</span>
                )}
              </div>
            </div>

            {/* Builder */}
            {builderPuzzle ? (
              <ParsewordsBuilder
                key={`${selectedClue.clueNumber}-${selectedClue.direction}`}
                puzzle={builderPuzzle}
                onChange={handleBuilderChange}
              />
            ) : (
              <div className="bg-surface rounded-xl border border-border p-8 flex items-center justify-center">
                <div className="text-center space-y-3">
                  <p className="text-text-secondary text-sm">
                    {selectedClue.parsewordsId
                      ? 'Click Generate to load the existing puzzle into the builder.'
                      : 'Click Generate to create a puzzle from the AI model, then refine it in the builder.'}
                  </p>
                  <button
                    onClick={generate}
                    disabled={generating}
                    className="px-5 py-2 rounded-lg bg-primary text-white font-bold text-sm hover:bg-primary-hover disabled:opacity-50 transition-colors cursor-pointer inline-flex items-center gap-2"
                  >
                    {generating ? (
                      <>
                        <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
                        Generating…
                      </>
                    ) : (
                      'Generate Puzzle'
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-64 text-text-secondary text-sm italic">
            {selectedPuzzleId ? 'Select a clue to get started.' : 'Select a puzzle first.'}
          </div>
        )}

        {/* ── Right sidebar: chat helper ── */}
        <div className="hidden lg:block max-h-[60vh] overflow-hidden">
          <AdminChatPanel />
        </div>
      </div>
    </div>
  )
}
