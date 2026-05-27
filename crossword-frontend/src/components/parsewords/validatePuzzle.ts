import type { Puzzle, Trigger } from './types'
import { normalize, computeFns, allInsertions } from './helpers'

// ---------------------------------------------------------------------------
// Internal state type (mutable text, fixed IDs/roles)
// ---------------------------------------------------------------------------

type SimToken = { id: string; text: string; role: string }

function tokenKey(tokens: SimToken[]): string {
  return tokens.map((t) => t.text).join('|')
}

function isWin(state: SimToken[], answer: string): boolean {
  const nonDef = state.filter((t) => t.role !== 'definition' && t.role !== 'link')
  return nonDef.length === 1 && normalize(nonDef[0].text) === normalize(answer)
}

// ---------------------------------------------------------------------------
// Trigger matching — find all triggers that fire on the current state
// ---------------------------------------------------------------------------

type TriggerMatch = { trigger: Trigger; start: number; end: number }

function findMatchingTriggers(state: SimToken[], triggers: Trigger[]): TriggerMatch[] {
  const results: TriggerMatch[] = []
  for (const trigger of triggers) {
    const words = trigger.match.split(' ')
    const n = words.length
    for (let i = 0; i <= state.length - n; i++) {
      const slice = state.slice(i, i + n)
      if (slice.map((t) => t.text).join(' ') === trigger.match) {
        results.push({ trigger, start: i, end: i + n - 1 })
        break // a trigger can only match one span
      }
    }
  }
  return results
}

// ---------------------------------------------------------------------------
// State transitions — mirror ParsewordsGame.tsx pickOption / consumeAndInsert
// ---------------------------------------------------------------------------

let opCounter = 0

function applyReplace(state: SimToken[], start: number, chosen: string): SimToken[] {
  // Single token: update text in place, preserving id & role
  return state.map((t, i) => (i === start ? { ...t, text: chosen } : t))
}

function applyConsume(state: SimToken[], start: number, end: number, chosen: string): SimToken[] {
  const newToken: SimToken = { id: `vop_${++opCounter}`, text: chosen, role: 'wordplay' }
  return [...state.slice(0, start), newToken, ...state.slice(end + 1)]
}

function getNextStates(
  state: SimToken[],
  match: TriggerMatch,
): { chosen: string; next: SimToken[] }[] {
  const { trigger, start, end } = match
  const { action } = trigger

  if (action.kind === 'replace') {
    const isSingle = start === end
    return action.options.map((opt) => ({
      chosen: opt,
      next: isSingle ? applyReplace(state, start, opt) : applyConsume(state, start, end, opt),
    }))
  }

  if (action.kind === 'result') {
    return action.options.map((opt) => ({
      chosen: opt,
      next: applyConsume(state, start, end, opt),
    }))
  }

  if (action.kind === 'compute') {
    const src = state.slice(start, end + 1).find((t) => normalize(t.text) === normalize(action.source))
    if (!src) return []
    const result = computeFns[action.fn](normalize(src.text))
    return [{ chosen: result, next: applyConsume(state, start, end, result) }]
  }

  if (action.kind === 'container') {
    const wordplays = state.slice(start, end + 1).filter((t) => t.role !== 'indicator')
    const [a, b] = wordplays
    if (!a || !b) return []
    const all = [
      ...allInsertions(normalize(b.text), normalize(a.text)),
      ...allInsertions(normalize(a.text), normalize(b.text)),
    ]
    return [...new Set(all)].map((opt) => ({
      chosen: opt,
      next: applyConsume(state, start, end, opt),
    }))
  }

  return []
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type PathStep = { match: string; chosen: string }

export type ValidationResult =
  | { solvable: true; path: PathStep[] }
  | { solvable: false; reason: string }

// ---------------------------------------------------------------------------
// BFS solver
// ---------------------------------------------------------------------------

const MAX_DEPTH = 30
const MAX_VISITED = 5_000

export function validatePuzzle(puzzle: Puzzle): ValidationResult {
  opCounter = 0

  const initial: SimToken[] = puzzle.tokens.map((t, i) => ({
    id: t.id ?? `t${i + 1}`,
    text: t.text,
    role: t.role,
  }))

  if (isWin(initial, puzzle.answer)) {
    return { solvable: true, path: [] }
  }

  const visited = new Set<string>()
  const queue: { state: SimToken[]; path: PathStep[] }[] = [{ state: initial, path: [] }]

  while (queue.length > 0) {
    if (visited.size >= MAX_VISITED) {
      return { solvable: false, reason: `Search exceeded ${MAX_VISITED} states — puzzle may be too complex or have cycles` }
    }

    const { state, path } = queue.shift()!
    const key = tokenKey(state)
    if (visited.has(key)) continue
    visited.add(key)

    if (path.length >= MAX_DEPTH) continue

    for (const match of findMatchingTriggers(state, puzzle.triggers)) {
      for (const { chosen, next } of getNextStates(state, match)) {
        const nextKey = tokenKey(next)
        if (visited.has(nextKey)) continue

        const nextPath = [...path, { match: match.trigger.match, chosen }]
        if (isWin(next, puzzle.answer)) {
          return { solvable: true, path: nextPath }
        }
        queue.push({ state: next, path: nextPath })
      }
    }
  }

  return { solvable: false, reason: 'No path to the answer was found' }
}
