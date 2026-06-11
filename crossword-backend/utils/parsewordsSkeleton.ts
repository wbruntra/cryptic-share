/**
 * Deterministically builds a minimal Parsewords puzzle skeleton from a
 * verified cryptic clue explanation.
 *
 * The skeleton contains only the correct solution path — one option per
 * trigger. Pass it to an LLM to add red herrings and wrong options.
 *
 * Requires clue_segmentation in the explanation (available on explanations
 * generated after the May 2026 schema update).
 */

import type {
  ParsewordsPuzzle,
  Trigger,
  TriggerAction,
  PuzzleToken,
  TokenRole,
  CrypticType,
} from './parsewordsGenerator'

interface ExplanationStep {
  tokens: string | string[]
  operation: string
  result: string
  clue_after: string
}

interface SegmentationToken {
  text: string
  role: string
}

// origIdx tracks which original segmentation slot this token came from.
// null means the token was synthesised by a prior trigger.
interface StateToken {
  origIdx: number | null
  text: string
  role: TokenRole
}

// ---------------------------------------------------------------------------
// Token matching (mirrors verifyExplanation.ts normalisation)
// ---------------------------------------------------------------------------

function stripTrailingPunct(s: string): string {
  return s.replace(/[^a-zA-Z0-9]+$/, '').toLowerCase()
}

function wordMatchesToken(word: string, token: string): boolean {
  const isPunctOnly = /^[^a-zA-Z0-9]+$/.test(token)
  if (isPunctOnly) return word === token
  const wc = stripTrailingPunct(word)
  const tc = stripTrailingPunct(token)
  return wc === tc && tc.length > 0
}

function findInState(
  tokenWords: string[],
  state: StateToken[],
): { start: number; end: number } | null {
  if (tokenWords.length === 0) return null
  for (let i = 0; i <= state.length - tokenWords.length; i++) {
    let allMatch = true
    for (let j = 0; j < tokenWords.length; j++) {
      if (!wordMatchesToken(state[i + j]!.text, tokenWords[j]!)) {
        allMatch = false
        break
      }
    }
    if (allMatch) return { start: i, end: i + tokenWords.length - 1 }
  }
  return null
}

// ---------------------------------------------------------------------------
// Operation classification
// ---------------------------------------------------------------------------

type OpClass = {
  kind: 'replace' | 'result' | 'compute' | 'container'
  label: CrypticType
  computeFn?: 'trim-last' | 'trim-first' | 'reverse'
}

function classifyOperation(op: string, sourceText: string, result: string): OpClass {
  const o = op.toLowerCase().trim()

  // Exact enum matches (standardised format going forward)
  if (o === 'reversal') return { kind: 'compute', label: 'reversal', computeFn: 'reverse' }
  if (o === 'container') return { kind: 'container', label: 'container' }
  if (o === 'anagram') return { kind: 'result', label: 'anagram' }
  if (o === 'hidden') return { kind: 'result', label: 'hidden' }
  if (o === 'homophone') return { kind: 'result', label: 'homophone' }
  if (o === 'initials') return { kind: 'result', label: 'initials' }
  if (o === 'concatenate') return { kind: 'result', label: 'charade' }
  // delete: removal of interior/specified letters — cannot be derived from
  // first/last-letter rules, so present the explicit result as the option.
  if (o === 'delete') return { kind: 'result', label: 'deletion' }
  if (o === 'trim') {
    const srcNorm = sourceText.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
    const resNorm = result.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
    if (srcNorm.slice(1) === resNorm) return { kind: 'compute', label: 'trim', computeFn: 'trim-first' }
    if (srcNorm.slice(0, -1) === resNorm) return { kind: 'compute', label: 'trim', computeFn: 'trim-last' }
    // Mislabelled as trim but isn't a clean first/last cut — treat as deletion.
    return { kind: 'result', label: 'deletion' }
  }
  // synonym / abbreviate / literal / translation → replace
  if (o === 'synonym' || o === 'abbreviate' || o === 'literal' || o === 'translation') {
    return { kind: 'replace', label: 'synonym' }
  }

  // Fuzzy fallback for older free-form operation strings
  if (o.includes('reversal') || o.includes('reverse')) {
    return { kind: 'compute', label: 'reversal', computeFn: 'reverse' }
  }
  if (
    o.includes('trim') || o.includes('curtail') || o.includes('behead') ||
    o.includes('delete') || o.includes('remove') || o.includes('without') ||
    o.includes('lose') || o.includes('drop')
  ) {
    const srcNorm = sourceText.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
    const resNorm = result.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
    // Only a true first/last-letter trim can be computed mechanically.
    if (srcNorm.slice(1) === resNorm) return { kind: 'compute', label: 'trim', computeFn: 'trim-first' }
    if (srcNorm.slice(0, -1) === resNorm) return { kind: 'compute', label: 'trim', computeFn: 'trim-last' }
    // Otherwise it's an interior/substring deletion — present the explicit result.
    return { kind: 'result', label: 'deletion' }
  }
  if (o.includes('container') || o.includes('insert') || o.includes('inside') || o.includes('within')) {
    return { kind: 'container', label: 'container' }
  }
  if (o.includes('anagram')) return { kind: 'result', label: 'anagram' }
  if (o.includes('hidden') || o.includes('concealed')) return { kind: 'result', label: 'hidden' }
  if (o.includes('homophone') || o.includes('sounds like')) return { kind: 'result', label: 'homophone' }
  if (o.includes('initial')) return { kind: 'result', label: 'initials' }
  if (o.includes('concatenate') || o.includes('charade') || o.includes('join')) {
    return { kind: 'result', label: 'charade' }
  }

  return { kind: 'replace', label: 'synonym' }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeLetters(s: string): string {
  return s.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
}

function tokensString(tokens: string | string[]): string {
  return typeof tokens === 'string' ? tokens : tokens.join(' ')
}

function isPlaceholderStep(step: ExplanationStep): boolean {
  const t = tokensString(step.tokens).trim()
  return t.length === 0 || t === '(none)'
}

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

export function buildSkeletonFromExplanation(
  explanation: Record<string, unknown>,
  clueText: string,
  answer: string,
): ParsewordsPuzzle | null {
  const clueType = explanation.clue_type as string | undefined
  if (clueType !== 'wordplay' && clueType !== '&lit') return null

  const segmentation = explanation.clue_segmentation as SegmentationToken[] | undefined
  if (!segmentation || segmentation.length === 0) return null

  const rawSteps = explanation.wordplay_steps as ExplanationStep[] | undefined
  if (!rawSteps || rawSteps.length === 0) return null

  const steps = rawSteps.filter((s) => !isPlaceholderStep(s))
  if (steps.length === 0) return null

  // Build initial state with original indices so we can track consumption
  let state: StateToken[] = segmentation.map((seg, i) => ({
    origIdx: i,
    text: seg.text,
    role: seg.role as TokenRole,
  }))

  const triggers: Trigger[] = []

  for (const step of steps) {
    const tokenWords = tokensString(step.tokens).trim().split(/\s+/).filter(Boolean)
    const result = typeof step.result === 'string' ? step.result.trim() : ''

    const found = findInState(tokenWords, state)
    if (!found) continue

    const { start, end } = found
    const matchedTokens = state.slice(start, end + 1)
    const matchStr = matchedTokens.map((t) => t.text).join(' ')

    // Source for compute ops: the non-indicator token in the match
    const sourceToken =
      matchedTokens.find((t) => t.role !== 'indicator') ?? matchedTokens[0]!

    const opClass = classifyOperation(step.operation, sourceToken.text, result)
    const isSingleReplace = opClass.kind === 'replace' && start === end

    let action: TriggerAction
    if (opClass.kind === 'compute') {
      action = {
        kind: 'compute',
        fn: opClass.computeFn!,
        source: sourceToken.text,
        label: opClass.label,
      }
    } else if (opClass.kind === 'container') {
      action = { kind: 'container', label: opClass.label }
    } else if (opClass.kind === 'result') {
      action = { kind: 'result', options: [result], label: opClass.label }
    } else {
      action = { kind: 'replace', options: [result], label: opClass.label }
    }

    triggers.push({ match: matchStr, action })

    // Advance state.
    // Single-token replace: rename in-place (keep origIdx, the solver does the same).
    // Everything else: consume span → new synthesised token.
    if (isSingleReplace) {
      state = state.map((t, i) => (i === start ? { ...t, text: result } : t))
    } else {
      const newToken: StateToken = { origIdx: null, text: result, role: 'wordplay' }
      state = [...state.slice(0, start), newToken, ...state.slice(end + 1)]
    }
  }

  if (triggers.length === 0) return null

  // Any indicator/link token that was never consumed by a trigger has no trigger
  // that can fire on it — it would block the win condition. Mark such tokens as
  // 'link' so the solver ignores them (same treatment as filler words).
  const remainingOrigIdxes = new Set(
    state.filter((t) => t.origIdx !== null).map((t) => t.origIdx!),
  )

  const tokens: PuzzleToken[] = segmentation.map((seg, i) => ({
    text: seg.text,
    role: (
      (seg.role === 'indicator' || seg.role === 'link') && remainingOrigIdxes.has(i)
        ? 'link'
        : seg.role
    ) as TokenRole,
  }))

  const normalizedAnswer = normalizeLetters(answer)
  const displayAnswer = answer.trim().toUpperCase()
  const hasSpaces = displayAnswer.includes(' ')

  return {
    label: hasSpaces ? displayAnswer : normalizedAnswer,
    clue: clueText,
    answer: normalizedAnswer,
    ...(hasSpaces ? { displayAnswer } : {}),
    tokens,
    triggers,
  }
}
