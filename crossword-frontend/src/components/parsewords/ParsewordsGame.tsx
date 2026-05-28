import { useRef, useState, useEffect } from 'react'
import type { DisplayToken, Puzzle } from './types'
import { normalize, computeFns, allInsertions, findTrigger } from './helpers'

type ResolvedAction = { kind: 'replace' | 'result'; options: string[] }

interface Props {
  puzzle: Puzzle
  onWin?: () => void
}

export function ParsewordsGame({ puzzle, onWin }: Props) {
  const seedTokens = (tokens: typeof puzzle.tokens): DisplayToken[] =>
    tokens.map((t, i) => ({ ...t, id: t.id ?? `t${i + 1}` }))

  const [displayTokens, setDisplayTokens] = useState<DisplayToken[]>(
    seedTokens(puzzle.tokens),
  )
  const [selected, setSelected] = useState<string[]>([])
  const opCounter = useRef(0)

  // Reset when puzzle prop changes
  useEffect(() => {
    setDisplayTokens(seedTokens(puzzle.tokens))
    setSelected([])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzle])

  function reset() {
    setDisplayTokens(seedTokens(puzzle.tokens))
    setSelected([])
  }

  const selectedTokens = displayTokens.filter((t) => selected.includes(t.id))
  const activeTrigger = findTrigger(selectedTokens, puzzle.triggers)

  let resolved: ResolvedAction | null = null
  if (activeTrigger) {
    const { action } = activeTrigger
    if (action.kind === 'replace') {
      resolved = { kind: 'replace', options: action.options }
    } else if (action.kind === 'result') {
      resolved = { kind: 'result', options: action.options }
    } else if (action.kind === 'compute') {
      const src = selectedTokens.find((t) => normalize(t.text) === normalize(action.source))!
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

  const nonDefinitionTokens = displayTokens.filter(
    (t) => t.role !== 'definition' && t.role !== 'link',
  )
  const won = nonDefinitionTokens.length === 1 && nonDefinitionTokens[0].text === puzzle.answer

  const onWinRef = useRef(onWin)
  onWinRef.current = onWin
  useEffect(() => {
    if (won) onWinRef.current?.()
  }, [won])

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const idx = displayTokens.findIndex((t) => t.id === id)

      if (prev.includes(id)) {
        // Deselecting — only allow clean removal from the edges.
        // If in the middle, clear entirely (can't maintain contiguity).
        const selIdxs = prev
          .map((sid) => displayTokens.findIndex((t) => t.id === sid))
          .sort((a, b) => a - b)
        const pos = selIdxs.indexOf(idx)
        if (pos === 0 || pos === selIdxs.length - 1) {
          return prev.filter((x) => x !== id)
        }
        return []
      }

      // Selecting — only extend if adjacent to the current contiguous span.
      if (prev.length === 0) return [id]

      const selIdxs = prev
        .map((sid) => displayTokens.findIndex((t) => t.id === sid))
        .sort((a, b) => a - b)
      const min = selIdxs[0]
      const max = selIdxs[selIdxs.length - 1]

      if (idx === min - 1 || idx === max + 1) {
        return [...prev, id]
      }

      // Not adjacent — start a fresh selection with just this token.
      return [id]
    })
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
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <p className="text-[var(--color-text-secondary)] text-sm italic">{puzzle.clue}</p>
        <button
          onClick={reset}
          className="ml-4 shrink-0 px-3 py-1 text-xs rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:border-[var(--color-text-secondary)] transition-colors cursor-pointer"
        >
          Reset
        </button>
      </div>

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
                  <span key={item.id} style={{ color: '#fff', borderBottom: '1px solid #fff', paddingBottom: '2px', display: 'inline-block', animation: 'victory-pop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) 0.2s both' }} className="text-base font-medium">
                    {item.text}
                  </span>
                ) : (
                  <div key={item.id} style={{ background: '#111', color: '#fff', boxShadow: '0 0 0 2px #facc15' }} className="px-4 py-2 rounded-lg text-base font-medium">
                    {puzzle.displayAnswer ?? item.text}
                  </div>
                ),
              )
            })()}
          </div>
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          {(() => {
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
              return (
                <div key={`run-${i}`} className="flex" style={{ transform: 'skewX(-8deg)', background: '#facc15' }}>
                  {group.tokens.map((token, j) => {
                    const isIndicator = token.role === 'indicator'
                    const isLast = j === group.tokens.length - 1
                    return (
                      <button key={token.id} onClick={() => toggleSelect(token.id)}
                        style={{ background: 'transparent', color: '#000', borderRadius: '0', borderBottom: isIndicator ? '4px solid #92400e' : undefined, borderRight: !isLast ? '1px solid rgba(0,0,0,0.15)' : undefined }}
                        className="px-4 py-2 text-base font-medium cursor-pointer select-none">
                        <span style={{ display: 'inline-block', transform: 'skewX(8deg)' }}>{token.text}</span>
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
            {resolved.options.map((opt, i) => (
              <button key={i} onClick={() => pickOption(opt)}
                className={`px-4 py-2 font-bold text-base cursor-pointer select-none transition-colors ${resolved!.kind === 'replace' ? 'rounded-lg bg-[#facc15] text-black' : 'rounded-full bg-blue-500 text-white tracking-widest hover:bg-blue-400'}`}>
                {opt}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
