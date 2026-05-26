import { describe, test, expect } from 'bun:test'
import { verifyExplanation } from '../utils/verifyExplanation'
import type { ExplanationVerification } from '../utils/verifyExplanation'

const DWELL_EXPLANATION = {
  clue_type: 'wordplay',
  definition: 'Stay',
  wordplay_steps: [
    {
      tokens: 'disgusting',
      operation: 'synonym',
      result: 'LEWD',
      clue_after: 'Stay, having put up LEWD student (5)',
    },
    {
      tokens: 'having put up LEWD',
      operation: 'reverse (indicator "having put up")',
      result: 'DWEL',
      clue_after: 'Stay, DWEL student (5)',
    },
    {
      tokens: 'student',
      operation: 'abbreviate (learner -> L)',
      result: 'L',
      clue_after: 'Stay, DWEL L (5)',
    },
    {
      tokens: 'DWEL L',
      operation: 'concatenate (charade)',
      result: 'DWELL',
      clue_after: 'Stay, DWELL (5)',
    },
  ],
  hint: { definition_location: 'start' as const, wordplay_types: ['synonym', 'reversal', 'abbreviation'] },
  full_explanation: 'Definition: Stay. disgusting=LEWD reversed=DWEL, student=L gives DWELL.',
}

const BLOOD_SPORTS_EXPLANATION = {
  clue_type: 'wordplay',
  definition: "huntin', shootin' and fishin'?",
  wordplay_steps: [
    {
      tokens: 'Boss told pro about',
      operation: "anagram (indicator 'about')",
      result: 'BLOOD SPORTS',
      clue_after: "BLOOD SPORTS huntin', shootin' and fishin'?",
    },
  ],
  hint: { definition_location: 'end' as const, wordplay_types: ['anagram'] },
  full_explanation: 'Anagram of BOSS TOLD PRO indicated by about.',
}

const ENZYME_BAD_EXPLANATION = {
  clue_type: 'wordplay',
  definition: 'biochemical',
  wordplay_steps: [
    {
      tokens: 'unknown',
      operation: 'translate to variable letter',
      result: 'Z',
      clue_after: 'Enemy panicked, having taken Z biochemical',
    },
    {
      tokens: 'Enemy having taken Z',
      operation: 'concatenate',
      result: 'ENEMYZ',
      clue_after: 'ENEMYZ panicked biochemical',
    },
    {
      tokens: 'ENEMYZ panicked',
      operation: 'anagram',
      result: 'ENZYME',
      clue_after: 'ENZYME biochemical',
    },
  ],
  hint: { definition_location: 'end' as const, wordplay_types: ['letter variable', 'concatenation', 'anagram'] },
  full_explanation: 'unknown=Z, Enemy+Z=ENEMYZ, anagram=ENZYME.',
}

const DOUBLE_DEF_EXPLANATION = {
  clue_type: 'double_definition',
  definitions: [
    { definition: 'Theatre in Hackney', sense: 'music hall/theatre' },
    { definition: 'was controlled by Victoria', sense: 'sovereign territory' },
  ],
  hint: { definition_count: 2 as const },
  full_explanation: 'Double definition: theatre and a sovereign territory.',
}

const EMPTY_TOKENS_EXPLANATION = {
  clue_type: 'wordplay',
  definition: 'SE Asian',
  wordplay_steps: [
    {
      tokens: '(none)',
      operation: '(none)',
      result: '',
      clue_after: '',
    },
  ],
  hint: { definition_location: 'start' as const, wordplay_types: ['anagram'] },
  full_explanation: 'No clean parse.',
}

describe('verifyExplanation', () => {
  test('verifies a correct multi-step wordplay explanation (Dwell)', () => {
    const result = verifyExplanation(
      DWELL_EXPLANATION,
      'Stay, having put up disgusting student (5)',
      'Dwell',
    )
    expect(result.verified).toBe(true)
    expect(result.steps.length).toBe(4)
    expect(result.steps.every((s) => s.verified)).toBe(true)
    expect(result.finalAnswerPresent).toBe(true)
    expect(result.clueType).toBe('wordplay')
  })

  test('verifies a correct single-step wordplay explanation (Blood sports)', () => {
    const result = verifyExplanation(
      BLOOD_SPORTS_EXPLANATION,
      "Boss told pro about huntin', shootin' and fishin'? (5,6)",
      'Blood sports',
    )
    expect(result.verified).toBe(true)
    expect(result.steps.length).toBe(1)
    expect(result.steps[0].verified).toBe(true)
    expect(result.finalAnswerPresent).toBe(true)
  })

  test('rejects explanation with non-contiguous tokens (Enzyme)', () => {
    const result = verifyExplanation(
      ENZYME_BAD_EXPLANATION,
      'Enemy panicked, having taken unknown biochemical (6)',
      'Enzyme',
    )
    expect(result.verified).toBe(false)
    // Step 1 should pass: "unknown" → "Z"
    expect(result.steps[0].verified).toBe(true)
    // Step 2 should fail: "Enemy having taken Z" can't be found contiguously
    expect(result.steps[1].verified).toBe(false)
    expect(result.steps[1].detail).toContain('not found')
  })

  test('returns error for double_definition clue (no wordplay_steps)', () => {
    const result = verifyExplanation(
      DOUBLE_DEF_EXPLANATION,
      'Theatre in Hackney was controlled by Victoria (6)',
      'Empire',
    )
    expect(result.verified).toBe(false)
    expect(result.error).toContain('no wordplay_steps')
    expect(result.steps).toHaveLength(0)
  })

  test('rejects explanation with (none) placeholder tokens', () => {
    const result = verifyExplanation(
      EMPTY_TOKENS_EXPLANATION,
      'SE Asian national ordered to ignore name (7)',
      'Laotian',
    )
    expect(result.verified).toBe(false)
    expect(result.error).toContain('no wordplay_steps')
  })

  test('detects when answer is not present in final state', () => {
    const badExplanation = {
      clue_type: 'wordplay',
      definition: 'sleepy tune',
      wordplay_steps: [
        {
          tokens: 'Christmas',
          operation: 'synonym',
          result: 'YULE',
          clue_after: 'With YULE nearly over recall dance sleepy tune',
        },
      ],
      hint: { definition_location: 'end' as const, wordplay_types: ['synonym'] },
      full_explanation: '...',
    }
    const result = verifyExplanation(
      badExplanation,
      'With Christmas nearly over recall dance sleepy tune (7)',
      'LULLABY',
    )
    expect(result.verified).toBe(true)
    expect(result.finalAnswerPresent).toBe(false)
  })

  test('handles &lit clues with wordplay_steps', () => {
    const andLit = {
      clue_type: '&lit',
      definition_scope: 'entire_clue',
      wordplay_steps: [
        {
          tokens: "Dean's fast",
          operation: 'synonym',
          result: 'SWIFT',
          clue_after: 'SWIFT',
        },
      ],
      hint: { wordplay_types: ['synonym'] },
      full_explanation: '&lit double meaning for SWIFT.',
    }
    const result = verifyExplanation(andLit, "Dean's fast (5)", 'Swift')
    expect(result.verified).toBe(true)
    expect(result.finalAnswerPresent).toBe(true)
  })

  test('handles multi-word tokens correctly (Acetic)', () => {
    const acetic = {
      clue_type: 'wordplay',
      definition: 'Sour',
      wordplay_steps: [
        { tokens: 'Spain', operation: 'synonym', result: 'E', clue_after: 'Sour sort of cacti found around E' },
        { tokens: 'sort of cacti', operation: 'anagram', result: 'ACTIC', clue_after: 'Sour ACTIC found around E' },
        { tokens: 'ACTIC found around E', operation: 'insert E into ACTIC (container)', result: 'ACETIC', clue_after: 'Sour ACETIC' },
      ],
      hint: { definition_location: 'start' as const, wordplay_types: ['synonym', 'anagram', 'container'] },
      full_explanation: '...',
    }
    const result = verifyExplanation(acetic, 'Sour sort of cacti found around Spain (6)', 'Acetic')
    expect(result.verified).toBe(true)
    expect(result.steps.every((s) => s.verified)).toBe(true)
  })

  test('handles punctuation in token string (em-dash in Calumny)', () => {
    const calumny = {
      clue_type: '&lit',
      definition_scope: 'entire_clue',
      wordplay_steps: [
        {
          tokens: "No \u2014 may appear in any column that's been edited",
          operation: 'anagram',
          result: 'CALUMNY',
          clue_after: 'CALUMNY',
        },
      ],
      hint: { wordplay_types: ['anagram'] },
      full_explanation: 'Anagram.',
    }
    const result = verifyExplanation(
      calumny,
      "No \u2014 may appear in any column that's been edited (7)",
      'Calumny',
    )
    expect(result.verified).toBe(true)
  })

  test('handles multi-word answer with spaces (Ear lobe → EARLOBE)', () => {
    const earLobe = {
      clue_type: 'wordplay',
      definition: 'dangling from this?',
      wordplay_steps: [
        {
          tokens: 'Peer at medal,',
          operation: 'anagram',
          result: 'EARLOBE',
          clue_after: 'EARLOBE dangling from this?',
        },
      ],
      hint: { definition_location: 'end' as const, wordplay_types: ['anagram'] },
      full_explanation: 'Anagram of PEER AT MEDAL.',
    }
    const result = verifyExplanation(
      earLobe,
      'Peer at medal, dangling from this? (3,4)',
      'Ear lobe',
    )
    expect(result.verified).toBe(true)
    expect(result.finalAnswerPresent).toBe(true)
  })

  test('reports correct step verification results', () => {
    const result = verifyExplanation(
      DWELL_EXPLANATION,
      'Stay, having put up disgusting student (5)',
      'Dwell',
    ) as ExplanationVerification

    expect(result.steps[0]).toEqual({ stepIndex: 0, verified: true, detail: 'step matches' })
    expect(result.steps[1]).toEqual({ stepIndex: 1, verified: true, detail: 'step matches' })
    expect(result.steps[2]).toEqual({ stepIndex: 2, verified: true, detail: 'step matches' })
    expect(result.steps[3]).toEqual({ stepIndex: 3, verified: true, detail: 'step matches' })
  })

  test('handles legacy array token format gracefully', () => {
    const legacy = {
      clue_type: 'wordplay',
      definition: 'test',
      wordplay_steps: [
        {
          tokens: ['disgusting'],
          operation: 'synonym',
          result: 'LEWD',
          clue_after: 'Stay, having put up LEWD student (5)',
        },
        {
          tokens: ['having', 'put', 'up', 'LEWD'],
          operation: 'reverse',
          result: 'DWEL',
          clue_after: 'Stay, DWEL student (5)',
        },
      ],
      hint: { definition_location: 'start' as const, wordplay_types: ['synonym'] },
      full_explanation: '...',
    }
    const result = verifyExplanation(
      legacy,
      'Stay, having put up disgusting student (5)',
      'Dwell',
    )
    // Legacy array form is joined with spaces; if contiguous it still verifies
    expect(result.verified).toBe(true)
    expect(result.steps[0].verified).toBe(true)
    expect(result.steps[1].verified).toBe(true)
  })
})
