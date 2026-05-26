import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { useGetPuzzlesQuery } from '../store/api/adminApi'
import type { Puzzle } from '../components/parsewords/types'
import { ParsewordsGame } from '../components/parsewords/ParsewordsGame'
import { TriggerSummary } from '../components/parsewords/TriggerSummary'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ClueSummary {
  clueNumber: number
  direction: string
  clueText: string
  answer: string
  explanation: unknown
  parsewordsId: number | null
  puzzle: unknown | null
  parsewordsUpdatedAt: string | null
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ParsewordsAdminPage() {
  const { data: puzzles = [], isLoading: puzzlesLoading } = useGetPuzzlesQuery()

  const [selectedPuzzleId, setSelectedPuzzleId] = useState<number | null>(null)
  const [clues, setClues] = useState<ClueSummary[]>([])
  const [cluesLoading, setCluesLoading] = useState(false)

  const [selectedClue, setSelectedClue] = useState<ClueSummary | null>(null)
  const [generatedJson, setGeneratedJson] = useState<string>('')
  const [jsonError, setJsonError] = useState<string>('')
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string>('')

  // Load clues when puzzle is selected
  useEffect(() => {
    if (!selectedPuzzleId) return
    setClues([])
    setSelectedClue(null)
    setGeneratedJson('')
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
    setGeneratedJson(clue.puzzle ? JSON.stringify(clue.puzzle, null, 2) : '')
    setJsonError('')
    setSaveMessage('')
  }

  async function generate() {
    if (!selectedPuzzleId || !selectedClue) return
    setGenerating(true)
    setJsonError('')
    setSaveMessage('')
    try {
      const { data } = await axios.post('/api/parsewords/admin/generate', {
        puzzleId: selectedPuzzleId,
        clueNumber: selectedClue.clueNumber,
        direction: selectedClue.direction,
      })
      setGeneratedJson(JSON.stringify(data, null, 2))
    } catch (e: any) {
      setJsonError(e?.response?.data?.message ?? 'Generation failed')
    } finally {
      setGenerating(false)
    }
  }

  async function save() {
    if (!selectedPuzzleId || !selectedClue || !generatedJson) return
    let parsed: unknown
    try {
      parsed = JSON.parse(generatedJson)
    } catch {
      setJsonError('Invalid JSON — fix before saving.')
      return
    }
    setSaving(true)
    setJsonError('')
    try {
      await axios.post('/api/parsewords/admin/save', {
        puzzleId: selectedPuzzleId,
        clueNumber: selectedClue.clueNumber,
        direction: selectedClue.direction,
        puzzle: parsed,
      })
      setSaveMessage('Saved!')
      // Update clue in list to show saved status
      setClues((prev) =>
        prev.map((c) =>
          c.clueNumber === selectedClue.clueNumber && c.direction === selectedClue.direction
            ? { ...c, puzzle: parsed, parsewordsId: c.parsewordsId ?? -1, parsewordsUpdatedAt: new Date().toISOString() }
            : c,
        ),
      )
      setSelectedClue((prev) =>
        prev ? { ...prev, puzzle: parsed, parsewordsId: prev.parsewordsId ?? -1 } : prev,
      )
    } catch (e: any) {
      setJsonError(e?.response?.data?.message ?? 'Save failed')
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

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
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
                onChange={(e) => setSelectedPuzzleId(Number(e.target.value) || null)}
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

        {/* ── Right panel: editor ── */}
        {selectedClue ? (
          <div className="space-y-4">
            {/* Clue info */}
            <div className="bg-surface rounded-xl border border-border p-4">
              <div className="flex items-baseline gap-3 mb-2">
                <span className="font-mono font-bold text-primary">
                  {selectedClue.clueNumber}{selectedClue.direction.charAt(0).toUpperCase()}
                </span>
                <span className="text-text">{selectedClue.clueText}</span>
                <span className="font-mono font-bold text-text ml-auto">{selectedClue.answer.toUpperCase()}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {/* Explanation */}
              <div>
                <div className="text-xs font-bold tracking-widest text-text-secondary uppercase mb-2">
                  Explanation
                </div>
                <div className="bg-surface rounded-xl border border-border p-4 h-64 overflow-auto">
                  <pre className="text-xs font-mono text-text-secondary whitespace-pre-wrap">
                    {JSON.stringify(selectedClue.explanation, null, 2)}
                  </pre>
                </div>
              </div>

              {/* Generated puzzle editor */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-bold tracking-widest text-text-secondary uppercase">
                    Puzzle Definition
                    {selectedClue.parsewordsUpdatedAt && (
                      <span className="ml-2 normal-case font-normal">
                        (saved {new Date(selectedClue.parsewordsUpdatedAt).toLocaleDateString()})
                      </span>
                    )}
                  </div>
                </div>
                <div className={`bg-surface rounded-xl border p-4 ${jsonError ? 'border-error' : generatedJson ? 'border-primary/50' : 'border-border'}`}>
                  <textarea
                    className="w-full h-56 text-xs font-mono bg-transparent outline-none resize-none text-text"
                    value={generatedJson}
                    onChange={(e) => {
                      setGeneratedJson(e.target.value)
                      setJsonError('')
                      setSaveMessage('')
                    }}
                    placeholder="No puzzle yet — click Generate to create one."
                    spellCheck={false}
                  />
                </div>
                {jsonError && <p className="mt-1 text-xs text-error">{jsonError}</p>}
              </div>
            </div>

            {/* Action bar */}
            <div className="flex items-center gap-3">
              <button
                onClick={generate}
                disabled={generating}
                className="px-5 py-2 rounded-lg bg-primary text-white font-bold text-sm hover:bg-primary-hover disabled:opacity-50 transition-colors cursor-pointer"
              >
                {generating ? (
                  <span className="flex items-center gap-2">
                    <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
                    Generating…
                  </span>
                ) : selectedClue.parsewordsId ? 'Regenerate' : 'Generate'}
              </button>

              <button
                onClick={save}
                disabled={saving || !generatedJson}
                className="px-5 py-2 rounded-lg bg-green-600 text-white font-bold text-sm hover:bg-green-700 disabled:opacity-40 transition-colors cursor-pointer"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>

              {saveMessage && (
                <span className="text-sm text-green-600 font-medium">{saveMessage}</span>
              )}
            </div>

            {/* Preview panels — parsed from current JSON in the editor */}
            {(() => {
              let parsed: Puzzle | null = null
              try { parsed = generatedJson ? JSON.parse(generatedJson) as Puzzle : null } catch { /* invalid JSON */ }
              if (!parsed) return null
              return (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 pt-2 border-t border-border">
                  {/* Trigger summary */}
                  <div className="bg-surface rounded-xl border border-border p-4">
                    <TriggerSummary puzzle={parsed} />
                  </div>
                  {/* Playable preview */}
                  <div className="bg-[var(--color-bg)] rounded-xl border border-border p-4">
                    <div className="text-xs font-bold tracking-widest text-text-secondary uppercase mb-3">
                      Playable Preview
                    </div>
                    <ParsewordsGame key={generatedJson} puzzle={parsed} />
                  </div>
                </div>
              )
            })()}
          </div>
        ) : (
          <div className="flex items-center justify-center h-64 text-text-secondary text-sm italic">
            {selectedPuzzleId ? 'Select a clue to get started.' : 'Select a puzzle first.'}
          </div>
        )}
      </div>
    </div>
  )
}
