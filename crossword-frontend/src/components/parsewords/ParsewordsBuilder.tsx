import { useState, useCallback, useEffect, useRef } from 'react'
import type { Puzzle, Trigger, TriggerAction, TokenRole } from './types'
import { ParsewordsGame } from './ParsewordsGame'
import { validatePuzzle, type ValidationResult } from './validatePuzzle'

const ROLE_STYLES: Record<TokenRole, { bg: string; color: string; border: string; label: string }> = {
  definition: { bg: '#1e3a8a22', color: '#3b82f6', border: '#3b82f640', label: 'def' },
  indicator:  { bg: '#14532d22', color: '#16a34a', border: '#16a34a40', label: 'ind' },
  wordplay:   { bg: '#78350f22', color: '#d97706', border: '#d9770640', label: 'wp' },
  link:       { bg: '#37415122', color: '#9ca3af', border: '#9ca3af40', label: 'link' },
}

interface Props {
  puzzle: Puzzle | null
  clue: string
  answer: string
  onChange: (puzzle: Puzzle) => void
}

function tokenTextsFromClue(clue: string): string[] {
  return clue.split(/\s+/).filter(Boolean)
}

function defaultPuzzle(clue: string, answer: string): Puzzle {
  return {
    label: answer,
    clue,
    answer: answer.replace(/\s/g, '').toUpperCase(),
    displayAnswer: answer.includes(' ') ? answer : undefined,
    tokens: tokenTextsFromClue(clue).map((text) => ({ text, role: 'wordplay' as TokenRole })),
    triggers: [],
  }
}

function TriggerEditor({
  trigger,
  index,
  onChange,
  onDelete,
}: {
  trigger: Trigger
  index: number
  onChange: (t: Trigger) => void
  onDelete: () => void
}) {
  const action = trigger.action

  return (
    <div className="bg-surface rounded-xl border border-border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="w-6 h-6 rounded-full bg-input-bg text-text-secondary text-xs flex items-center justify-center font-bold shrink-0">
            {index + 1}
          </span>
          <input
            type="text"
            value={trigger.match}
            onChange={(e) => onChange({ ...trigger, match: e.target.value })}
            placeholder="Trigger match text..."
            className="flex-1 min-w-0 px-3 py-1.5 rounded-lg border border-border bg-input-bg text-sm font-mono font-bold text-amber-500 focus:outline-none focus:ring-2 focus:ring-primary"
            spellCheck={false}
          />
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onDelete}
            className="w-6 h-6 rounded text-xs flex items-center justify-center border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
            title="Delete trigger"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Action kind selector */}
      <select
        value={action.kind}
        onChange={(e) => {
          const kind = e.target.value as TriggerAction['kind']
          let newAction: TriggerAction
          if (kind === 'replace') newAction = { kind: 'replace', options: ['', '', ''] }
          else if (kind === 'result') newAction = { kind: 'result', options: ['', '', ''] }
          else if (kind === 'compute') newAction = { kind: 'compute', fn: 'trim-last', source: '' }
          else newAction = { kind: 'container' }
          onChange({ ...trigger, action: newAction })
        }}
        className="px-3 py-1.5 rounded-lg border border-border bg-input-bg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
      >
        <option value="replace">Replace (synonym)</option>
        <option value="result">Result (combine / transform)</option>
        <option value="compute">Compute (trim / reverse)</option>
        <option value="container">Container (insertion)</option>
      </select>

      {/* Action-specific fields */}
      {action.kind === 'replace' || action.kind === 'result' ? (
        <div className="space-y-2">
          {action.options.map((opt, i) => (
            <div key={i} className="flex items-center gap-2">
              <span
                className={`shrink-0 w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center ${
                  i === 0
                    ? 'bg-green-500/20 text-green-600 border border-green-500/30'
                    : 'bg-input-bg text-text-secondary border border-border'
                }`}
              >
                {i + 1}
              </span>
              <input
                type="text"
                value={opt}
                onChange={(e) => {
                  const opts = [...action.options]
                  opts[i] = e.target.value
                  onChange({ ...trigger, action: { ...action, options: opts } as TriggerAction })
                }}
                placeholder={i === 0 ? 'Correct answer (required)' : `Wrong option ${i}`}
                className={`flex-1 px-3 py-1.5 rounded-lg border text-sm font-mono bg-input-bg focus:outline-none focus:ring-2 focus:ring-primary ${
                  i === 0 && !opt ? 'border-amber-500/50' : 'border-border'
                }`}
                spellCheck={false}
              />
            </div>
          ))}
          <div className="flex gap-2">
            {action.options.length < 5 && (
              <button
                onClick={() => onChange({ ...trigger, action: { ...action, options: [...action.options, ''] } as TriggerAction })}
                className="text-xs text-text-secondary hover:text-text px-2 py-1 rounded border border-border hover:border-text-secondary transition-colors cursor-pointer"
              >
                + Add option
              </button>
            )}
            {action.options.length > 1 && (
              <button
                onClick={() => onChange({ ...trigger, action: { ...action, options: action.options.slice(0, -1) } as TriggerAction })}
                className="text-xs text-text-secondary hover:text-text px-2 py-1 rounded border border-border hover:border-text-secondary transition-colors cursor-pointer"
              >
                – Remove last
              </button>
            )}
          </div>
        </div>
      ) : action.kind === 'compute' ? (
        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={action.fn}
            onChange={(e) => onChange({ ...trigger, action: { ...action, fn: e.target.value as 'trim-last' | 'trim-first' | 'reverse' } })}
            className="px-3 py-1.5 rounded-lg border border-border bg-input-bg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="trim-last">Drop last letter (nearly, almost, etc.)</option>
            <option value="trim-first">Drop first letter (beheaded, etc.)</option>
            <option value="reverse">Reverse (back, returned, etc.)</option>
          </select>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-text-secondary">on token:</span>
            <input
              type="text"
              value={action.source}
              onChange={(e) => onChange({ ...trigger, action: { ...action, source: e.target.value.toUpperCase() } })}
              placeholder="e.g. YULE"
              className="w-28 px-3 py-1.5 rounded-lg border border-border text-sm font-mono bg-input-bg focus:outline-none focus:ring-2 focus:ring-primary"
              spellCheck={false}
            />
          </div>
        </div>
      ) : action.kind === 'container' ? (
        <p className="text-xs text-text-secondary italic">
          Player will choose the correct insertion from all possible positions. No options to configure — candidates are generated automatically.
        </p>
      ) : null}
    </div>
  )
}

export function ParsewordsBuilder({ puzzle, clue, answer, onChange }: Props) {
  const [state, setState] = useState<Puzzle>(() => {
    if (puzzle) return puzzle
    return defaultPuzzle(clue, answer)
  })

  // Sync from props when they change externally (e.g. after generation)
  const puzzleRef = useRef(puzzle)
  useEffect(() => {
    if (puzzle !== puzzleRef.current) {
      puzzleRef.current = puzzle
      if (puzzle) setState(puzzle)
      else setState(defaultPuzzle(clue, answer))
    }
  }, [puzzle, clue, answer])

  const [selectedTokenIndices, setSelectedTokenIndices] = useState<number[]>([])

  const update = useCallback(
    (patch: Partial<Puzzle> | ((prev: Puzzle) => Puzzle)) => {
      setState((prev) => {
        const next = typeof patch === 'function' ? patch(prev) : { ...prev, ...patch }
        onChange(next)
        return next
      })
    },
    [onChange],
  )

  const toggleSelect = useCallback(
    (idx: number) => {
      setSelectedTokenIndices((prev) => {
        if (prev.includes(idx)) {
          const selIdxs = prev.sort((a, b) => a - b)
          const pos = selIdxs.indexOf(idx)
          if (pos === 0 || pos === selIdxs.length - 1) return prev.filter((x) => x !== idx)
          return []
        }
        if (prev.length === 0) return [idx]
        const selIdxs = prev.sort((a, b) => a - b)
        const min = selIdxs[0]
        const max = selIdxs[selIdxs.length - 1]
        if (idx === min - 1 || idx === max + 1) return [...prev, idx]
        return [idx]
      })
    },
    [],
  )

  const selectedText = selectedTokenIndices
    .sort((a, b) => a - b)
    .map((i) => state.tokens[i].text)
    .join(' ')

  const existingTriggerForSelection = state.triggers.find((t) => t.match === selectedText)

  const addTrigger = useCallback(() => {
    if (!selectedText || existingTriggerForSelection) return
    const newTrigger: Trigger = { match: selectedText, action: { kind: 'replace', options: ['', '', ''] } }
    update({ triggers: [...state.triggers, newTrigger] })
    setSelectedTokenIndices([])
  }, [selectedText, existingTriggerForSelection, state.triggers, update])

  const updateTrigger = useCallback(
    (index: number, trigger: Trigger) => {
      const triggers = [...state.triggers]
      triggers[index] = trigger
      update({ triggers })
    },
    [state.triggers, update],
  )

  const deleteTrigger = useCallback(
    (index: number) => {
      update({ triggers: state.triggers.filter((_, i) => i !== index) })
    },
    [state.triggers, update],
  )

  const updateTokenRole = useCallback(
    (index: number, role: TokenRole) => {
      const tokens = [...state.tokens]
      tokens[index] = { ...tokens[index], role }
      update({ tokens })
    },
    [state.tokens, update],
  )

  const validation: ValidationResult = validatePuzzle(state)

  return (
    <div className="space-y-5">
      {/* ── Puzzle metadata ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-[10px] font-bold tracking-widest text-text-secondary uppercase mb-1">Label</label>
          <input
            type="text"
            value={state.label}
            onChange={(e) => update({ label: e.target.value })}
            className="w-full px-3 py-1.5 rounded-lg border border-border bg-input-bg text-text text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold tracking-widest text-text-secondary uppercase mb-1">Answer</label>
          <input
            type="text"
            value={state.answer}
            onChange={(e) => update({ answer: e.target.value })}
            className="w-full px-3 py-1.5 rounded-lg border border-border bg-input-bg text-text text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold tracking-widest text-text-secondary uppercase mb-1">Display Answer</label>
          <input
            type="text"
            value={state.displayAnswer ?? ''}
            onChange={(e) => update({ displayAnswer: e.target.value || undefined })}
            placeholder="Same as answer"
            className="w-full px-3 py-1.5 rounded-lg border border-border bg-input-bg text-text text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>

      {/* ── Token row with role selectors ── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-bold tracking-widest text-text-secondary uppercase">Tokens</div>
          <div className="flex gap-2 text-[10px]">
            {(Object.entries(ROLE_STYLES) as [TokenRole, typeof ROLE_STYLES[TokenRole]][]).map(([role, s]) => (
              <span key={role} style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }} className="px-1.5 py-0.5 rounded font-mono">
                {s.label}
              </span>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 p-4 bg-surface rounded-xl border border-border min-h-[64px]">
          {state.tokens.map((token, i) => {
            const isSelected = selectedTokenIndices.includes(i)
            return (
              <div key={i} className="flex flex-col items-center gap-1">
                <button
                  onClick={() => toggleSelect(i)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 cursor-pointer select-none border-2 ${
                    isSelected
                      ? 'border-amber-400 bg-amber-400 text-black scale-105 shadow-md'
                      : 'border-border bg-input-bg text-text hover:border-text-secondary'
                  }`}
                >
                  {token.text}
                </button>
                <select
                  value={token.role}
                  onChange={(e) => updateTokenRole(i, e.target.value as TokenRole)}
                  className="text-[10px] px-1 py-0.5 rounded border border-border bg-surface text-text-secondary focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                  title={`Role for "${token.text}"`}
                >
                  <option value="definition">def</option>
                  <option value="wordplay">wp</option>
                  <option value="indicator">ind</option>
                  <option value="link">link</option>
                </select>
              </div>
            )
          })}
        </div>
        <p className="text-[10px] text-text-secondary mt-1.5 italic">
          Select contiguous tokens to add a trigger from clue words, or use "Custom trigger" below to define any match string.
        </p>
      </div>

      {/* ── Add trigger button ── */}
      {selectedTokenIndices.length > 0 && !existingTriggerForSelection && (
        <button
          onClick={addTrigger}
          className="w-full px-4 py-3 rounded-xl border-2 border-dashed border-amber-500/50 text-amber-400 hover:border-amber-400 hover:text-amber-300 hover:bg-amber-500/5 text-sm font-medium transition-colors cursor-pointer"
        >
          + Add trigger for "{selectedText}"
        </button>
      )}
      {selectedTokenIndices.length > 0 && existingTriggerForSelection && (
        <p className="text-xs text-amber-400/70 italic text-center">
          A trigger for "{selectedText}" already exists. Scroll down to edit it.
        </p>
      )}

      {/* ── Trigger list ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs font-bold tracking-widest text-text-secondary uppercase">
            Triggers ({state.triggers.length})
          </div>
          <button
            onClick={() => {
              const newTrigger: Trigger = { match: '', action: { kind: 'replace', options: ['', '', ''] } }
              update({ triggers: [...state.triggers, newTrigger] })
            }}
            className="px-3 py-1 text-xs rounded-lg border border-border text-text-secondary hover:text-text hover:border-text-secondary transition-colors cursor-pointer"
          >
            + Custom trigger
          </button>
        </div>
        <div className="space-y-3">
          {state.triggers.map((trigger, i) => (
            <TriggerEditor
              key={i}
              trigger={trigger}
              index={i}
              onChange={(t) => updateTrigger(i, t)}
              onDelete={() => deleteTrigger(i)}
            />
          ))}
        </div>
      </div>

      {/* ── Validation ── */}
      <div
        className={`rounded-xl border p-3 ${
          validation.solvable ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'
        }`}
      >
        <div className="flex items-center gap-2 mb-1">
          <span
            className={`text-xs font-bold tracking-widest uppercase ${
              validation.solvable ? 'text-green-600' : 'text-red-500'
            }`}
          >
            {validation.solvable ? '✓ Solvable' : '✗ Not solvable'}
          </span>
          {!validation.solvable && <span className="text-xs text-red-400">{validation.reason}</span>}
        </div>
        {validation.solvable && validation.path.length > 0 && (
          <ol className="space-y-0.5">
            {validation.path.map((step, i) => (
              <li key={i} className="flex items-center gap-2 text-xs font-mono">
                <span className="text-text-secondary">{i + 1}.</span>
                <span className="text-amber-500">{step.match}</span>
                <span className="text-text-secondary">→</span>
                <span style={{ background: '#facc15', color: '#000' }} className="px-1.5 py-0.5 rounded font-bold">
                  {step.chosen}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* ── Live preview ── */}
      <div>
        <div className="text-xs font-bold tracking-widest text-text-secondary uppercase mb-3">Live Preview</div>
        <div className="bg-[var(--color-bg)] rounded-xl border border-border p-4">
          <ParsewordsGame key={JSON.stringify(state)} puzzle={state} />
        </div>
      </div>
    </div>
  )
}
