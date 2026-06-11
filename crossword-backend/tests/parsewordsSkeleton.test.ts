import { describe, test, expect } from 'bun:test'
import { buildSkeletonFromExplanation } from '../utils/parsewordsSkeleton'
import { validatePuzzle } from '../utils/parsewordsSolver'

// ---------------------------------------------------------------------------
// Explanation fixtures from puzzle 3 (real DB data)
// ---------------------------------------------------------------------------

const DURABLE_EXPLANATION = {
  clue_type: 'wordplay',
  clue_segmentation: [
    { text: 'Bad', role: 'wordplay' },
    { text: 'rule', role: 'wordplay' },
    { text: 'flouted', role: 'indicator' },
    { text: 'Thats', role: 'definition' },
    { text: 'tough', role: 'definition' },
  ],
  definition: "That's tough",
  wordplay_steps: [
    {
      tokens: 'Bad rule flouted',
      operation: 'anagram',
      result: 'DURABLE',
      clue_after: 'DURABLE Thats tough',
    },
  ],
}

const DOWAGER_EXPLANATION = {
  clue_type: 'wordplay',
  clue_segmentation: [
    { text: 'Do', role: 'wordplay' },
    { text: 'women', role: 'wordplay' },
    { text: 'grow', role: 'wordplay' },
    { text: 'older', role: 'wordplay' },
    { text: 'by', role: 'indicator' },
    { text: 'right', role: 'wordplay' },
    { text: 'such', role: 'definition' },
    { text: 'as', role: 'definition' },
    { text: 'this', role: 'definition' },
    { text: 'Lady', role: 'definition' },
    { text: '?', role: 'indicator' },
  ],
  definition: 'such as this Lady',
  wordplay_steps: [
    {
      tokens: 'Do',
      operation: 'literal',
      result: 'DO',
      clue_after: 'DO women grow older by right such as this Lady ?',
    },
    {
      tokens: 'women',
      operation: 'abbreviate',
      result: 'W',
      clue_after: 'DO W grow older by right such as this Lady ?',
    },
    {
      tokens: 'grow older',
      operation: 'synonym',
      result: 'AGE',
      clue_after: 'DO W AGE by right such as this Lady ?',
    },
    {
      tokens: 'by right',
      operation: 'abbreviate',
      result: 'R',
      clue_after: 'DO W AGE R such as this Lady ?',
    },
    {
      tokens: 'DO W AGE R',
      operation: 'concatenate',
      result: 'DOWAGER',
      clue_after: 'DOWAGER such as this Lady ?',
    },
  ],
}

const ROCKET_SCIENTIST_EXPLANATION = {
  clue_type: 'wordplay',
  clue_segmentation: [
    { text: 'Eg', role: 'definition' },
    { text: 'von', role: 'definition' },
    { text: "Braun's", role: 'definition' },
    { text: 'test', role: 'wordplay' },
    { text: 'etc', role: 'wordplay' },
    { text: 'is', role: 'wordplay' },
    { text: 'in', role: 'wordplay' },
    { text: 'Cork', role: 'wordplay' },
    { text: 'amazingly', role: 'indicator' },
  ],
  definition: "E.g. von Braun's",
  wordplay_steps: [
    {
      tokens: 'test etc is in Cork amazingly',
      operation: 'anagram',
      result: 'ROCKET SCIENTIST',
      clue_after: "Eg von Braun's ROCKET SCIENTIST",
    },
  ],
}

// A reversal + trim fixture (not from DB, constructed to test those ops)
const DWELL_SKELETON_EXPLANATION = {
  clue_type: 'wordplay',
  clue_segmentation: [
    { text: 'Stay,', role: 'definition' },
    { text: 'having', role: 'indicator' },
    { text: 'put', role: 'indicator' },
    { text: 'up', role: 'indicator' },
    { text: 'disgusting', role: 'wordplay' },
    { text: 'student', role: 'wordplay' },
  ],
  definition: 'Stay',
  wordplay_steps: [
    {
      tokens: 'disgusting',
      operation: 'synonym',
      result: 'LEWD',
      clue_after: 'Stay, having put up LEWD student',
    },
    {
      tokens: 'having put up LEWD',
      operation: 'reversal',
      result: 'DWEL',
      clue_after: 'Stay, DWEL student',
    },
    {
      tokens: 'student',
      operation: 'abbreviate',
      result: 'L',
      clue_after: 'Stay, DWEL L',
    },
    {
      tokens: 'DWEL L',
      operation: 'concatenate',
      result: 'DWELL',
      clue_after: 'Stay, DWELL',
    },
  ],
}

// A trim fixture — indicator follows the source word in clue order ("yule almost")
const TRIM_EXPLANATION = {
  clue_type: 'wordplay',
  clue_segmentation: [
    { text: 'Tune', role: 'definition' },
    { text: 'yule', role: 'wordplay' },
    { text: 'almost', role: 'indicator' },
  ],
  definition: 'Tune',
  wordplay_steps: [
    {
      tokens: 'yule almost',
      operation: 'trim',
      result: 'YUL',
      clue_after: 'Tune YUL',
    },
  ],
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildSkeletonFromExplanation', () => {
  test('returns null for non-wordplay clue types', () => {
    const result = buildSkeletonFromExplanation(
      { clue_type: 'double_definition' },
      'Some clue',
      'ANSWER',
    )
    expect(result).toBeNull()
  })

  test('returns null when clue_segmentation is missing', () => {
    const result = buildSkeletonFromExplanation(
      { clue_type: 'wordplay', wordplay_steps: [{ tokens: 'foo', operation: 'synonym', result: 'BAR', clue_after: 'BAR' }] },
      'foo clue',
      'BAR',
    )
    expect(result).toBeNull()
  })

  test('DURABLE — single anagram step', () => {
    const puzzle = buildSkeletonFromExplanation(
      DURABLE_EXPLANATION,
      'Bad rule flouted? Thats tough (7)',
      'Durable',
    )
    expect(puzzle).not.toBeNull()
    expect(puzzle!.answer).toBe('DURABLE')
    expect(puzzle!.tokens).toHaveLength(5)
    expect(puzzle!.triggers).toHaveLength(1)

    const [t] = puzzle!.triggers
    expect(t!.match).toBe('Bad rule flouted')
    expect(t!.action.kind).toBe('result')
    expect((t!.action as any).options[0]).toBe('DURABLE')
    expect((t!.action as any).label).toBe('anagram')
  })

  test('DURABLE skeleton is BFS-solvable', () => {
    const puzzle = buildSkeletonFromExplanation(
      DURABLE_EXPLANATION,
      'Bad rule flouted? Thats tough (7)',
      'Durable',
    )!
    const result = validatePuzzle(puzzle)
    expect(result.solvable).toBe(true)
    expect((result as any).path).toHaveLength(1)
  })

  test('DOWAGER — 5-step charade', () => {
    const puzzle = buildSkeletonFromExplanation(
      DOWAGER_EXPLANATION,
      'Do women grow older by right, such as this Lady? (7)',
      'Dowager',
    )
    expect(puzzle).not.toBeNull()
    expect(puzzle!.answer).toBe('DOWAGER')
    expect(puzzle!.triggers).toHaveLength(5)

    // Check each trigger match string and kind
    const matches = puzzle!.triggers.map((t) => ({ match: t.match, kind: t.action.kind }))
    expect(matches[0]).toEqual({ match: 'Do', kind: 'replace' })
    expect(matches[1]).toEqual({ match: 'women', kind: 'replace' })
    expect(matches[2]).toEqual({ match: 'grow older', kind: 'replace' })
    expect(matches[3]).toEqual({ match: 'by right', kind: 'replace' })
    expect(matches[4]).toEqual({ match: 'DO W AGE R', kind: 'result' })

    // The '?' indicator is never consumed by any trigger — it becomes 'link'
    // so the BFS win condition does not require it to be consumed.
    const questionToken = puzzle!.tokens.find((t) => t.text === '?')
    expect(questionToken?.role).toBe('link')
  })

  test('DOWAGER skeleton is BFS-solvable', () => {
    const puzzle = buildSkeletonFromExplanation(
      DOWAGER_EXPLANATION,
      'Do women grow older by right, such as this Lady? (7)',
      'Dowager',
    )!
    const result = validatePuzzle(puzzle)
    expect(result.solvable).toBe(true)
    expect((result as any).path).toHaveLength(5)
  })

  test('ROCKET SCIENTIST — multi-word answer anagram', () => {
    const puzzle = buildSkeletonFromExplanation(
      ROCKET_SCIENTIST_EXPLANATION,
      'E.g. von Braun\'s test etc. is in Cork amazingly (6,9)',
      'Rocket scientist',
    )
    expect(puzzle).not.toBeNull()
    expect(puzzle!.answer).toBe('ROCKETSCIENTIST')
    expect(puzzle!.displayAnswer).toBe('ROCKET SCIENTIST')
    expect(puzzle!.label).toBe('ROCKET SCIENTIST')
    expect(puzzle!.triggers).toHaveLength(1)

    const [t] = puzzle!.triggers
    expect(t!.match).toBe('test etc is in Cork amazingly')
    expect(t!.action.kind).toBe('result')
    expect((t!.action as any).options[0]).toBe('ROCKET SCIENTIST')
  })

  test('ROCKET SCIENTIST skeleton is BFS-solvable', () => {
    const puzzle = buildSkeletonFromExplanation(
      ROCKET_SCIENTIST_EXPLANATION,
      'E.g. von Braun\'s test etc. is in Cork amazingly (6,9)',
      'Rocket scientist',
    )!
    const result = validatePuzzle(puzzle)
    expect(result.solvable).toBe(true)
  })

  test('DWELL — reversal step detected correctly', () => {
    const puzzle = buildSkeletonFromExplanation(
      DWELL_SKELETON_EXPLANATION,
      'Stay, having put up disgusting student (5)',
      'Dwell',
    )
    expect(puzzle).not.toBeNull()
    expect(puzzle!.answer).toBe('DWELL')
    expect(puzzle!.triggers).toHaveLength(4)

    const reversalTrigger = puzzle!.triggers.find((t) => t.action.kind === 'compute')!
    expect(reversalTrigger).toBeDefined()
    expect(reversalTrigger.match).toBe('having put up LEWD')
    expect((reversalTrigger.action as any).fn).toBe('reverse')
    expect((reversalTrigger.action as any).source).toBe('LEWD')
  })

  test('DWELL skeleton is BFS-solvable', () => {
    const puzzle = buildSkeletonFromExplanation(
      DWELL_SKELETON_EXPLANATION,
      'Stay, having put up disgusting student (5)',
      'Dwell',
    )!
    const result = validatePuzzle(puzzle)
    expect(result.solvable).toBe(true)
  })

  test('trim direction is correctly inferred', () => {
    const puzzle = buildSkeletonFromExplanation(
      TRIM_EXPLANATION,
      'Tune almost yule',
      'YUL',
    )
    expect(puzzle).not.toBeNull()
    const computeTrigger = puzzle!.triggers.find((t) => t.action.kind === 'compute')!
    expect((computeTrigger.action as any).fn).toBe('trim-last')
  })
})
