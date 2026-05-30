import type { Puzzle, PuzzleToken, Trigger, TriggerAction, TokenRole } from './types'
import { CRYPTIC_DISPLAY } from './types'
import { normalize, computeFns } from './helpers'

// ---------------------------------------------------------------------------
// Role colours (token chips)
// ---------------------------------------------------------------------------

const roleStyle: Record<TokenRole, { bg: string; color: string; border: string }> = {
  wordplay:   { bg: '#78350f22', color: '#d97706', border: '#d9770640' },
  indicator:  { bg: '#14532d22', color: '#16a34a', border: '#16a34a40' },
  definition: { bg: '#1e3a8a22', color: '#3b82f6', border: '#3b82f640' },
  link:       { bg: '#37415122', color: '#9ca3af', border: '#9ca3af40' },
}

function TokenChip({ text, role }: { text: string; role: TokenRole }) {
  const s = roleStyle[role]
  return (
    <span
      style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}
      className="px-2 py-0.5 rounded text-xs font-mono font-medium"
    >
      {text}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Action description
// ---------------------------------------------------------------------------

function LabelBadge({ action }: { action: TriggerAction }) {
  if (!action.label) return null
  return (
    <span
      style={{ background: '#1e1b4b', color: '#a5b4fc', border: '1px solid #4338ca55' }}
      className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide shrink-0"
    >
      {CRYPTIC_DISPLAY[action.label]}
    </span>
  )
}

function ActionBadge({ action, matchTokens }: { action: TriggerAction; matchTokens: PuzzleToken[] }) {
  if (action.kind === 'replace') {
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        <LabelBadge action={action} />
        <span className="text-xs text-text-secondary">replace with</span>
        {action.options.map((opt, i) => (
          <span key={opt}
            style={i === 0 ? { background: '#facc15', color: '#000' } : { background: 'var(--color-input-bg)', color: 'var(--color-text-secondary)', opacity: 0.7 }}
            className="px-2 py-0.5 rounded text-xs font-bold font-mono">
            {opt}
          </span>
        ))}
      </div>
    )
  }

  if (action.kind === 'result') {
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        <LabelBadge action={action} />
        <span className="text-xs text-text-secondary">result</span>
        {action.options.map((opt, i) => (
          <span key={opt}
            style={i === 0 ? { background: '#3b82f6', color: '#fff' } : { background: 'var(--color-input-bg)', color: 'var(--color-text-secondary)', opacity: 0.7 }}
            className="px-2.5 py-0.5 rounded-full text-xs font-bold font-mono tracking-wide">
            {opt}
          </span>
        ))}
      </div>
    )
  }

  if (action.kind === 'compute') {
    const result = computeFns[action.fn](normalize(action.source))
    const label = action.fn === 'trim-last' ? 'drop last letter' : action.fn === 'trim-first' ? 'drop first letter' : 'reverse'
    return (
      <div className="flex items-center gap-1.5">
        <LabelBadge action={action} />
        <span className="text-xs text-text-secondary">{label}</span>
        <span className="text-xs font-mono font-bold text-amber-500">{action.source}</span>
        <span className="text-xs text-text-secondary">→</span>
        <span style={{ background: '#facc15', color: '#000' }} className="px-2 py-0.5 rounded text-xs font-bold font-mono">{result}</span>
      </div>
    )
  }

  if (action.kind === 'container') {
    const wordplays = matchTokens.filter((t) => t.role !== 'indicator')
    const [a, b] = wordplays
    if (a && b) {
      return (
        <div className="flex items-center gap-1.5">
          <LabelBadge action={action} />
          <span className="text-xs text-text-secondary">insert</span>
          <span className="text-xs font-mono font-bold text-amber-500">{a.text}</span>
          <span className="text-xs text-text-secondary">into</span>
          <span className="text-xs font-mono font-bold text-amber-500">{b.text}</span>
          <span className="text-xs text-text-secondary">(or vice versa)</span>
        </div>
      )
    }
    return <span className="text-xs text-text-secondary">container / insertion</span>
  }

  return null
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface Props {
  puzzle: Puzzle
}

// Build a lookup from text → role using original tokens (covers raw clue words)
function buildRoleMap(puzzle: Puzzle): Map<string, TokenRole> {
  const map = new Map<string, TokenRole>()
  for (const t of puzzle.tokens) map.set(t.text, t.role)
  return map
}

// For a trigger match token, find its PuzzleToken if it's an original token
// (derived tokens like "YULE" won't be in the original list)
function resolveMatchTokens(match: string, roleMap: Map<string, TokenRole>): PuzzleToken[] {
  return match.split(' ').map((text) => ({
    text,
    role: roleMap.get(text) ?? 'wordplay',
  }))
}

export function TriggerSummary({ puzzle }: Props) {
  const roleMap = buildRoleMap(puzzle)

  return (
    <div className="space-y-2">
      <div className="text-xs font-bold tracking-widest text-text-secondary uppercase mb-3">
        Triggers ({puzzle.triggers.length})
      </div>
      <div className="space-y-2">
        {puzzle.triggers.map((trigger, i) => {
          const matchTokens = resolveMatchTokens(trigger.match, roleMap)
          return (
            <div key={i} className="flex items-start gap-3 px-3 py-2.5 rounded-lg bg-surface border border-border">
              {/* Step number */}
              <span className="shrink-0 w-5 h-5 rounded-full bg-input-bg text-text-secondary text-xs flex items-center justify-center font-bold mt-0.5">
                {i + 1}
              </span>

              {/* Match tokens */}
              <div className="flex items-center gap-1 flex-wrap min-w-0 flex-1">
                {matchTokens.map((t, j) => (
                  <span key={j} className="flex items-center gap-1">
                    <TokenChip text={t.text} role={t.role} />
                    {j < matchTokens.length - 1 && (
                      <span className="text-text-secondary text-xs">+</span>
                    )}
                  </span>
                ))}
              </div>

              {/* Arrow */}
              <span className="shrink-0 text-text-secondary text-sm mt-0.5">→</span>

              {/* Action */}
              <div className="flex-1 min-w-0 mt-0.5">
                <ActionBadge action={trigger.action} matchTokens={matchTokens} />
              </div>
            </div>
          )
        })}
      </div>

      {/* Token role legend */}
      <div className="flex gap-3 pt-2 flex-wrap">
        {(Object.entries(roleStyle) as [TokenRole, typeof roleStyle[TokenRole]][]).map(([role, s]) => (
          <span key={role} className="flex items-center gap-1">
            <span style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }} className="px-1.5 py-0.5 rounded text-xs font-mono">{role}</span>
          </span>
        ))}
      </div>
    </div>
  )
}
