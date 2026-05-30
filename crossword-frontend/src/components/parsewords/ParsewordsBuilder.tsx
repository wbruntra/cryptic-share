import { useState } from 'react'
import type { CrypticType, Puzzle, Trigger, TriggerAction, TokenRole } from './types'
import { CRYPTIC_DISPLAY } from './types'
import { ParsewordsGame } from './ParsewordsGame'
import { validatePuzzle, type ValidationResult } from './validatePuzzle'

const ROLE_STYLES: Record<TokenRole, { bg: string; color: string; border: string; label: string }> = {
  definition: { bg: '#1e3a8a22', color: '#3b82f6', border: '#3b82f640', label: 'def' },
  indicator:  { bg: '#14532d22', color: '#16a34a', border: '#16a34a40', label: 'ind' },
  wordplay:   { bg: '#78350f22', color: '#d97706', border: '#d9770640', label: 'wp' },
  link:       { bg: '#37415122', color: '#9ca3af', border: '#9ca3af40', label: 'link' },
}

interface Props {
  puzzle: Puzzle
  onChange: (puzzle: Puzzle) => void
}

function TriggerEditor({
  trigger,
  index,
  total,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  trigger: Trigger
  index: number
  total: number
  onChange: (t: Trigger) => void
  onDelete: () => void
  onMoveUp: () => void
  onMoveDown: () => void
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
            onClick={onMoveUp}
            disabled={index === 0}
            className="w-6 h-6 rounded text-xs flex items-center justify-center border border-border text-text-secondary hover:bg-input-bg transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-default"
            title="Move up"
          >
            ↑
          </button>
          <button
            onClick={onMoveDown}
            disabled={index === total - 1}
            className="w-6 h-6 rounded text-xs flex items-center justify-center border border-border text-text-secondary hover:bg-input-bg transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-default"
            title="Move down"
          >
            ↓
          </button>
          <button
            onClick={onDelete}
            className="w-6 h-6 rounded text-xs flex items-center justify-center border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
            title="Delete trigger"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Action kind + label selectors */}
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={action.kind}
          onChange={(e) => {
            const kind = e.target.value as TriggerAction['kind']
            let newAction: TriggerAction
            if (kind === 'replace') newAction = { kind: 'replace', options: ['', '', ''], label: action.label }
            else if (kind === 'result') newAction = { kind: 'result', options: ['', '', ''], label: action.label }
            else if (kind === 'compute') newAction = { kind: 'compute', fn: 'trim-last', source: '', label: action.label }
            else newAction = { kind: 'container', label: action.label }
            onChange({ ...trigger, action: newAction })
          }}
          className="px-3 py-1.5 rounded-lg border border-border bg-input-bg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="replace">Replace (synonym)</option>
          <option value="result">Result (combine / transform)</option>
          <option value="compute">Compute (trim / reverse)</option>
          <option value="container">Container (insertion)</option>
        </select>
        <select
          value={action.label ?? ''}
          onChange={(e) => {
            const label = e.target.value as CrypticType | ''
            onChange({ ...trigger, action: { ...action, label: label || undefined } as TriggerAction })
          }}
          className="px-3 py-1.5 rounded-lg border border-border bg-input-bg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="">— no label —</option>
          {(Object.entries(CRYPTIC_DISPLAY) as [CrypticType, string][]).map(([val, display]) => (
            <option key={val} value={val}>{display}</option>
          ))}
        </select>
      </div>

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

export function ParsewordsBuilder({ puzzle, onChange }: Props) {
  const [selectedTokenIndices, setSelectedTokenIndices] = useState<number[]>([])

  const selectedText = [...selectedTokenIndices]
    .sort((a, b) => a - b)
    .map((i) => puzzle.tokens[i].text)
    .join(' ')

  const triggersForSelection = puzzle.triggers.filter((t) => t.match === selectedText)

  function toggleSelect(idx: number) {
    setSelectedTokenIndices((prev) => {
      if (prev.includes(idx)) {
        const selIdxs = [...prev].sort((a, b) => a - b)
        const pos = selIdxs.indexOf(idx)
        if (pos === 0 || pos === selIdxs.length - 1) return prev.filter((x) => x !== idx)
        return []
      }
      if (prev.length === 0) return [idx]
      const selIdxs = [...prev].sort((a, b) => a - b)
      const min = selIdxs[0]
      const max = selIdxs[selIdxs.length - 1]
      if (idx === min - 1 || idx === max + 1) return [...prev, idx]
      return [idx]
    })
  }

  function addTrigger() {
    if (!selectedText) return
    const newTrigger: Trigger = { match: selectedText, action: { kind: 'replace', options: ['', '', ''] } }
    onChange({ ...puzzle, triggers: [...puzzle.triggers, newTrigger] })
    setSelectedTokenIndices([])
  }

  function updateTrigger(index: number, trigger: Trigger) {
    const triggers = [...puzzle.triggers]
    triggers[index] = trigger
    onChange({ ...puzzle, triggers })
  }

  function deleteTrigger(index: number) {
    onChange({ ...puzzle, triggers: puzzle.triggers.filter((_, i) => i !== index) })
  }

  function moveTrigger(index: number, direction: -1 | 1) {
    const triggers = [...puzzle.triggers]
    const swapIndex = index + direction
    if (swapIndex < 0 || swapIndex >= triggers.length) return
    ;[triggers[index], triggers[swapIndex]] = [triggers[swapIndex], triggers[index]]
    onChange({ ...puzzle, triggers })
  }

  function updateTokenRole(index: number, role: TokenRole) {
    const tokens = [...puzzle.tokens]
    tokens[index] = { ...tokens[index], role }
    onChange({ ...puzzle, tokens })
  }

  const validation: ValidationResult = validatePuzzle(puzzle)

  return (
    <div className="space-y-5">
      {/* ── Puzzle metadata ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-[10px] font-bold tracking-widest text-text-secondary uppercase mb-1">Label</label>
          <input
            type="text"
            value={puzzle.label}
            onChange={(e) => onChange({ ...puzzle, label: e.target.value })}
            className="w-full px-3 py-1.5 rounded-lg border border-border bg-input-bg text-text text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold tracking-widest text-text-secondary uppercase mb-1">Answer</label>
          <input
            type="text"
            value={puzzle.answer}
            onChange={(e) => onChange({ ...puzzle, answer: e.target.value })}
            className="w-full px-3 py-1.5 rounded-lg border border-border bg-input-bg text-text text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold tracking-widest text-text-secondary uppercase mb-1">Display Answer</label>
          <input
            type="text"
            value={puzzle.displayAnswer ?? ''}
            onChange={(e) => onChange({ ...puzzle, displayAnswer: e.target.value || undefined })}
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
          {puzzle.tokens.map((token, i) => {
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
      {selectedTokenIndices.length > 0 && (
        <button
          onClick={addTrigger}
          className="w-full px-4 py-3 rounded-xl border-2 border-dashed border-amber-500/50 text-amber-400 hover:border-amber-400 hover:text-amber-300 hover:bg-amber-500/5 text-sm font-medium transition-colors cursor-pointer"
        >
          {triggersForSelection.length > 0
            ? `+ Add another trigger for "${selectedText}"`
            : `+ Add trigger for "${selectedText}"`}
        </button>
      )}

      {/* ── Trigger list ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs font-bold tracking-widest text-text-secondary uppercase">
            Triggers ({puzzle.triggers.length})
          </div>
          <button
            onClick={() => {
              const newTrigger: Trigger = { match: '', action: { kind: 'replace', options: ['', '', ''] } }
              onChange({ ...puzzle, triggers: [...puzzle.triggers, newTrigger] })
            }}
            className="px-3 py-1 text-xs rounded-lg border border-border text-text-secondary hover:text-text hover:border-text-secondary transition-colors cursor-pointer"
          >
            + Custom trigger
          </button>
        </div>
        <div className="space-y-3">
          {puzzle.triggers.map((trigger, i) => (
            <TriggerEditor
              key={i}
              trigger={trigger}
              index={i}
              total={puzzle.triggers.length}
              onChange={(t) => updateTrigger(i, t)}
              onDelete={() => deleteTrigger(i)}
              onMoveUp={() => moveTrigger(i, -1)}
              onMoveDown={() => moveTrigger(i, 1)}
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
          <ParsewordsGame puzzle={puzzle} />
        </div>
      </div>
    </div>
  )
}
