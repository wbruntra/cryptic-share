import { useRef, useState } from 'react'
import type { TokenRole } from '../components/wordplay/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TriggerAction =
  | { kind: 'replace'; options: string[] }
  | { kind: 'result';  options: string[] }
  | { kind: 'compute'; fn: 'trim-last' | 'reverse'; source: string }
  | { kind: 'container' }

type Trigger = {
  match: string[]        // exact current text of each selected token (order-independent)
  action: TriggerAction
}

type PuzzleToken = {
  id: string
  text: string
  role: TokenRole
}

type Puzzle = {
  label: string
  clue: string
  answer: string           // normalized for comparison (no spaces)
  displayAnswer?: string   // formatted for display (e.g. 'MAIL ORDER')
  tokens: PuzzleToken[]
  triggers: Trigger[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const normalize = (s: string) => s.replace(/[^a-zA-Z]/g, '').toUpperCase()

const computeFns: Record<string, (s: string) => string> = {
  'trim-last': (s) => s.slice(0, -1),
  'reverse':   (s) => [...s].reverse().join(''),
}

function allInsertions(inner: string, outer: string): string[] {
  const out: string[] = []
  for (let i = 0; i <= outer.length; i++)
    out.push(outer.slice(0, i) + inner + outer.slice(i))
  return out
}

type DisplayToken = { id: string; text: string; role: TokenRole }

function findTrigger(selectedTokens: DisplayToken[], triggers: Trigger[]): Trigger | null {
  const texts = selectedTokens.map((t) => t.text).sort()
  for (const trigger of triggers) {
    if ([...trigger.match].sort().join('|') === texts.join('|')) return trigger
  }
  return null
}

// ---------------------------------------------------------------------------
// Puzzle definitions
// ---------------------------------------------------------------------------

const lullabyPuzzle: Puzzle = {
  label: 'LULLABY',
  clue: "With Christmas nearly over recall dance's sleepy tune (7)",
  answer: 'LULLABY',
  tokens: [
    { id: 't1', text: 'With',      role: 'indicator' },
    { id: 't2', text: 'Christmas', role: 'wordplay' },
    { id: 't3', text: 'nearly',    role: 'indicator' },
    { id: 't4', text: 'over',      role: 'indicator' },
    { id: 't5', text: 'recall',    role: 'indicator' },
    { id: 't6', text: "dance's",   role: 'wordplay' },
    { id: 't7', text: 'sleepy',    role: 'definition' },
    { id: 't8', text: 'tune',      role: 'definition' },
  ],
  triggers: [
    { match: ['Christmas'],
      action: { kind: 'replace', options: ['YULE', 'NOEL', 'XMAS'] } },
    { match: ["dance's"],
      action: { kind: 'replace', options: ['BALL', 'WALTZ', 'JIVE'] } },
    { match: ['sleepy', 'tune'],
      action: { kind: 'replace', options: ['CRADLE SONG', 'SERENADE', 'NOCTURNE'] } },
    { match: ['YULE', 'nearly'],
      action: { kind: 'compute', fn: 'trim-last', source: 'YULE' } },
    { match: ['YUL', 'over'],
      action: { kind: 'compute', fn: 'reverse', source: 'YUL' } },
    { match: ['BALL', 'recall'],
      action: { kind: 'compute', fn: 'reverse', source: 'BALL' } },
    { match: ['With', 'LUY', 'LLAB'],
      action: { kind: 'container' } },
  ],
}

const trouncePuzzle: Puzzle = {
  label: 'TROUNCE',
  clue: 'Beat counter, frustrated (7)',
  answer: 'TROUNCE',
  tokens: [
    { id: 't1', text: 'Beat',       role: 'definition' },
    { id: 't2', text: 'counter,',   role: 'wordplay' },
    { id: 't3', text: 'frustrated', role: 'indicator' },
  ],
  triggers: [
    { match: ['Beat'],
      action: { kind: 'replace', options: ['DEFEAT', 'THRASH', 'PUMMEL'] } },
    { match: ['counter,', 'frustrated'],
      action: { kind: 'result', options: ['TROUNCE', 'RECOUNT', 'CORNUTE'] } },
  ],
}

const stylePuzzle: Puzzle = {
  label: 'STYLE',
  clue: "Let's somehow incorporate variable design (5)",
  answer: 'STYLE',
  tokens: [
    { id: 't1', text: "Let's",       role: 'wordplay' },
    { id: 't2', text: 'somehow',     role: 'indicator' },
    { id: 't3', text: 'incorporate', role: 'indicator' },
    { id: 't4', text: 'variable',    role: 'wordplay' },
    { id: 't5', text: 'design',      role: 'definition' },
  ],
  triggers: [
    { match: ['design'],
      action: { kind: 'replace', options: ['FASHION', 'MOTIF', 'PATTERN'] } },
    { match: ['variable'],
      action: { kind: 'replace', options: ['Y', 'X', 'N'] } },
    { match: ["Let's", 'somehow'],
      action: { kind: 'result', options: ['STLE', 'LEST', 'LETS'] } },
    { match: ['incorporate', 'STLE', 'Y'],
      action: { kind: 'container' } },
  ],
}

const excelPuzzle: Puzzle = {
  label: 'EXCEL',
  clue: 'It sounds like 40 in Rome do very well (5)',
  answer: 'EXCEL',
  tokens: [
    { id: 't1', text: 'It',     role: 'indicator' },
    { id: 't2', text: 'sounds', role: 'indicator' },
    { id: 't3', text: 'like',   role: 'indicator' },
    { id: 't4', text: '40',     role: 'wordplay' },
    { id: 't5', text: 'in',     role: 'link' },
    { id: 't6', text: 'Rome',   role: 'wordplay' },
    { id: 't7', text: 'do',     role: 'definition' },
    { id: 't8', text: 'very',   role: 'definition' },
    { id: 't9', text: 'well',   role: 'definition' },
  ],
  triggers: [
    { match: ['do', 'very', 'well'],
      action: { kind: 'replace', options: ['THRIVE', 'SUCCEED', 'PROSPER'] } },
    { match: ['40', 'in', 'Rome'],
      action: { kind: 'replace', options: ['XL', 'XC', 'FORTY'] } },
    { match: ['It', 'sounds', 'like', 'XL'],
      action: { kind: 'result', options: ['EXCEL', 'EXPEL', 'EXULT'] } },
  ],
}

const emceePuzzle: Puzzle = {
  label: 'EMCEE',
  clue: 'He introduces many comedians at the start in full (5)',
  answer: 'EMCEE',
  tokens: [
    { id: 't1',  text: 'He',         role: 'definition' },
    { id: 't2',  text: 'introduces', role: 'definition' },
    { id: 't3',  text: 'many',       role: 'wordplay' },
    { id: 't4',  text: 'comedians',  role: 'wordplay' },
    { id: 't5',  text: 'at',         role: 'indicator' },
    { id: 't6',  text: 'the',        role: 'indicator' },
    { id: 't7',  text: 'start',      role: 'indicator' },
    { id: 't8',  text: 'in',         role: 'indicator' },
    { id: 't9',  text: 'full',       role: 'indicator' },
  ],
  triggers: [
    { match: ['He', 'introduces'],
      action: { kind: 'replace', options: ['COMPERE', 'HOST', 'PRESENTER'] } },
    { match: ['start'],
      action: { kind: 'replace', options: ['BEGINNING', 'ONSET', 'OPENING'] } },
    { match: ['many', 'comedians', 'at', 'the', 'start'],
      action: { kind: 'result', options: ['MC', 'CM', 'MCO'] } },
    { match: ['MC', 'in', 'full'],
      action: { kind: 'result', options: ['EMCEE', 'EMCAY', 'MCEE'] } },
  ],
}

const mailOrderPuzzle: Puzzle = {
  label: 'MAIL ORDER',
  clue: 'Marie cleverly engages peer in buying by post (4,5)',
  answer: 'MAILORDER',
  displayAnswer: 'MAIL ORDER',
  tokens: [
    { id: 't1', text: 'Marie',   role: 'wordplay' },
    { id: 't2', text: 'cleverly', role: 'indicator' },
    { id: 't3', text: 'engages', role: 'indicator' },
    { id: 't4', text: 'peer',    role: 'wordplay' },
    { id: 't5', text: 'in',      role: 'link' },
    { id: 't6', text: 'buying',  role: 'definition' },
    { id: 't7', text: 'by',      role: 'definition' },
    { id: 't8', text: 'post',    role: 'definition' },
  ],
  triggers: [
    { match: ['peer'],
      action: { kind: 'replace', options: ['LORD', 'DUKE', 'EARL'] } },
    { match: ['post'],
      action: { kind: 'replace', options: ['MAIL', 'PILLAR', 'STAMP'] } },
    { match: ['buying', 'by', 'post'],
      action: { kind: 'replace', options: ['CATALOGUE', 'DELIVERY', 'SHOPPING'] } },
    { match: ['Marie', 'cleverly'],
      action: { kind: 'result', options: ['MAIER', 'AIMER', 'RAMIE'] } },
    { match: ['MAIER', 'engages', 'LORD'],
      action: { kind: 'container' } },
  ],
}

const sittingDownPuzzle: Puzzle = {
  label: 'SITTING DOWN',
  clue: 'Doing stint working with wife on sofa perhaps (7,4)',
  answer: 'SITTINGDOWN',
  displayAnswer: 'SITTING DOWN',
  tokens: [
    { id: 't1', text: 'Doing',   role: 'wordplay' },
    { id: 't2', text: 'stint',   role: 'wordplay' },
    { id: 't3', text: 'working', role: 'indicator' },
    { id: 't4', text: 'with',    role: 'indicator' },
    { id: 't5', text: 'wife',    role: 'wordplay' },
    { id: 't6', text: 'on',      role: 'definition' },
    { id: 't7', text: 'sofa',    role: 'definition' },
    { id: 't8', text: 'perhaps', role: 'definition' },
  ],
  triggers: [
    { match: ['wife'],
      action: { kind: 'replace', options: ['W', 'MISSUS', 'SPOUSE'] } },
    { match: ['on', 'sofa', 'perhaps'],
      action: { kind: 'replace', options: ['SEATED', 'RESTING', 'LOUNGING'] } },
    { match: ['Doing', 'stint', 'working'],
      action: { kind: 'result', options: ['SITTINGDON', 'STONIGDINT', 'DONITSTING'] } },
    { match: ['with', 'W', 'SITTINGDON'],
      action: { kind: 'container' } },
  ],
}

const puzzles: Puzzle[] = [lullabyPuzzle, trouncePuzzle, stylePuzzle, excelPuzzle, emceePuzzle, mailOrderPuzzle, sittingDownPuzzle]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ParsewordsTestPage() {
  const [puzzleIndex, setPuzzleIndex] = useState(0)
  const [displayTokens, setDisplayTokens] = useState<DisplayToken[]>(
    puzzles[0].tokens.map((t) => ({ ...t })),
  )
  const [selected, setSelected] = useState<string[]>([])
  const opCounter = useRef(0)

  const puzzle = puzzles[puzzleIndex]

  function switchPuzzle(index: number) {
    setPuzzleIndex(index)
    setDisplayTokens(puzzles[index].tokens.map((t) => ({ ...t })))
    setSelected([])
  }

  function reset() {
    setDisplayTokens(puzzle.tokens.map((t) => ({ ...t })))
    setSelected([])
  }

  const selectedTokens = displayTokens.filter((t) => selected.includes(t.id))
  const activeTrigger = findTrigger(selectedTokens, puzzle.triggers)

  // Resolve what to show
  type ResolvedAction = { kind: 'replace' | 'result'; options: string[] }
  let resolved: ResolvedAction | null = null

  if (activeTrigger) {
    const { action } = activeTrigger
    if (action.kind === 'replace') {
      resolved = { kind: 'replace', options: action.options }
    } else if (action.kind === 'result') {
      resolved = { kind: 'result', options: action.options }
    } else if (action.kind === 'compute') {
      const src = selectedTokens.find((t) => t.text === action.source)!
      resolved = { kind: 'result', options: [computeFns[action.fn](normalize(src.text))] }
    } else if (action.kind === 'container') {
      const wordplays = selectedTokens.filter((t) => t.role !== 'indicator')
      const [a, b] = wordplays
      const all = [
        ...allInsertions(normalize(b.text), normalize(a.text)),
        ...allInsertions(normalize(a.text), normalize(b.text)),
      ]
      resolved = { kind: 'result', options: [...new Set(all)] }
    }
  }

  // Victory
  const nonDefinitionTokens = displayTokens.filter((t) => t.role !== 'definition' && t.role !== 'link')
  const won = nonDefinitionTokens.length === 1 && nonDefinitionTokens[0].text === puzzle.answer

  function toggleSelect(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function consumeAndInsert(consumeIds: string[], text: string) {
    const consumedSet = new Set(consumeIds)
    const newToken: DisplayToken = { id: `op_${++opCounter.current}`, text, role: 'wordplay' }
    setDisplayTokens((prev) => {
      const next: DisplayToken[] = []
      let inserted = false
      for (const t of prev) {
        if (consumedSet.has(t.id)) {
          if (!inserted) { next.push(newToken); inserted = true }
        } else {
          next.push(t)
        }
      }
      return next
    })
    setSelected([])
  }

  function pickOption(text: string) {
    if (!resolved) return
    if (resolved.kind === 'replace' && selectedTokens.length === 1) {
      const id = selectedTokens[0].id
      setDisplayTokens((prev) => prev.map((t) => (t.id === id ? { ...t, text } : t)))
      setSelected([])
    } else {
      consumeAndInsert(selectedTokens.map((t) => t.id), text)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg)] p-6">
      <div className="max-w-3xl mx-auto space-y-8">

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--color-text)] mb-1">Parsewords</h1>
            <p className="text-[var(--color-text-secondary)] text-sm">Click words to select them.</p>
          </div>
          <button onClick={reset}
            className="px-3 py-1.5 text-sm rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:border-[var(--color-text-secondary)] transition-colors cursor-pointer">
            Reset
          </button>
        </div>

        <div className="flex gap-2 flex-wrap">
          {puzzles.map((p, i) => (
            <button key={i} onClick={() => switchPuzzle(i)}
              className="px-3 py-1.5 text-sm rounded-lg transition-colors cursor-pointer"
              style={i === puzzleIndex
                ? { background: '#facc15', color: '#000', fontWeight: 600 }
                : { background: 'transparent', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
              {p.label}
            </button>
          ))}
        </div>

        <div className="text-[var(--color-text-secondary)] text-sm italic">{puzzle.clue}</div>

        {won ? (
          <>
            <style>{`
              @keyframes victory-pop {
                0%   { opacity: 0; transform: translateY(20px) scale(0.8); }
                60%  { opacity: 1; transform: translateY(-6px) scale(1.12); }
                80%  { transform: translateY(3px) scale(0.96); }
                100% { opacity: 1; transform: translateY(0) scale(1); }
              }
            `}</style>
            <div className="flex flex-wrap items-center gap-4">
              {(() => {
                // Render tokens in puzzle order; group consecutive definition runs into one span
                type Item = { kind: 'answer' | 'definition'; text: string; id: string }
                const items: Item[] = []
                let defRun: DisplayToken[] = []
                const flushDef = () => {
                  if (defRun.length === 0) return
                  items.push({ kind: 'definition', text: defRun.map((t) => t.text).join(' '), id: defRun[0].id })
                  defRun = []
                }
                for (const token of displayTokens) {
                  if (token.role === 'link') continue
                  if (token.role === 'definition') defRun.push(token)
                  else { flushDef(); items.push({ kind: 'answer', text: token.text, id: token.id }) }
                }
                flushDef()

                return items.map((item) =>
                  item.kind === 'definition' ? (
                    <span key={item.id}
                      style={{
                        color: '#fff',
                        borderBottom: '1px solid #fff',
                        paddingBottom: '2px',
                        display: 'inline-block',
                        animation: 'victory-pop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) 0.2s both',
                      }}
                      className="text-base font-medium">
                      {item.text}
                    </span>
                  ) : (
                    <div key={item.id}
                      style={{ background: '#111', color: '#fff', boxShadow: '0 0 0 2px #facc15' }}
                      className="px-4 py-2 rounded-lg text-base font-medium">
                      {puzzle.displayAnswer ?? item.text}
                    </div>
                  )
                )
              })()}
            </div>
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            {(() => {
              // Group consecutive selected tokens into runs
              type Group =
                | { kind: 'selected'; tokens: DisplayToken[] }
                | { kind: 'unselected'; token: DisplayToken }
              const groups: Group[] = []
              for (const token of displayTokens) {
                if (selected.includes(token.id)) {
                  const last = groups[groups.length - 1]
                  if (last?.kind === 'selected') last.tokens.push(token)
                  else groups.push({ kind: 'selected', tokens: [token] })
                } else {
                  groups.push({ kind: 'unselected', token })
                }
              }

              return groups.map((group, i) => {
                if (group.kind === 'unselected') {
                  return (
                    <button key={group.token.id} onClick={() => toggleSelect(group.token.id)}
                      style={{ background: '#111', color: '#fff', boxShadow: '0 0 0 2px #facc15' }}
                      className="px-4 py-2 rounded-lg text-base font-medium transition-all duration-200 cursor-pointer select-none">
                      {group.token.text}
                    </button>
                  )
                }

                // Selected run — one skewed wrapper, tokens side by side
                return (
                  <div key={`run-${i}`} className="flex"
                    style={{ transform: 'skewX(-8deg)', background: '#facc15' }}>
                    {group.tokens.map((token, j) => {
                      const isIndicator = token.role === 'indicator'
                      const isLast = j === group.tokens.length - 1
                      return (
                        <button key={token.id} onClick={() => toggleSelect(token.id)}
                          style={{
                            background: 'transparent',
                            color: '#000',
                            borderRadius: '0',
                            borderBottom: isIndicator ? '4px solid #92400e' : undefined,
                            borderRight: !isLast ? '1px solid rgba(0,0,0,0.15)' : undefined,
                          }}
                          className="px-4 py-2 text-base font-medium cursor-pointer select-none">
                          <span style={{ display: 'inline-block', transform: 'skewX(8deg)' }}>
                            {token.text}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )
              })
            })()}
          </div>
        )}

        {!won && resolved && (
          <div className="space-y-3">
            <div className="text-xs font-bold tracking-widest text-[var(--color-text-secondary)] uppercase border-b border-dotted border-[var(--color-text-secondary)] pb-1 inline-block">
              {resolved.kind === 'replace' ? 'Replacement' : 'Result'}
            </div>
            <div className="flex flex-wrap gap-3">
              {resolved.options.map((opt) => (
                <button key={opt} onClick={() => pickOption(opt)}
                  className={`px-4 py-2 font-bold text-base cursor-pointer select-none transition-colors ${
                    resolved!.kind === 'replace'
                      ? 'rounded-lg bg-[#facc15] text-black'
                      : 'rounded-full bg-blue-500 text-white tracking-widest hover:bg-blue-400'
                  }`}>
                  {opt}
                </button>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
