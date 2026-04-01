import type { WordplayVisualization } from './types'

export type ExampleEntry = { label: string; data: WordplayVisualization }

/**
 * "Cold is on the way back, exactly as it was written" → SIC
 *
 * Cold → abbreviate → C
 * is → take → IS
 * C + IS → join → CIS
 * "on the way back" → reversal indicator → CIS reversed = SIC
 * SIC = "exactly as it was written" ✓
 */
export const sicExample: WordplayVisualization = {
  clue: 'Cold is on the way back, exactly as it was written',
  answer: 'SIC',
  tokens: [
    { id: 't1', text: 'Cold', role: 'wordplay' },
    { id: 't2', text: 'is', role: 'wordplay' },
    { id: 't3', text: 'on the way back,', role: 'indicator' },
    { id: 't4', text: 'exactly as it was written', role: 'definition' },
  ],
  stages: [
    {
      id: 's0',
      annotation: 'Cold → abbreviate → C',
      segments: [
        { kind: 'text', tokenId: 't1' },
        { kind: 'text', tokenId: 't2' },
        { kind: 'text', tokenId: 't3' },
        { kind: 'text', tokenId: 't4' },
      ],
    },
    {
      id: 's1',
      annotation: 'C + IS → join → CIS',
      segments: [
        { kind: 'letters', letters: 'C' },
        { kind: 'text', tokenId: 't2' },
        { kind: 'text', tokenId: 't3' },
        { kind: 'text', tokenId: 't4' },
      ],
    },
    {
      id: 's2',
      annotation: 'CIS → reverse → SIC',
      segments: [
        { kind: 'letters', letters: 'CIS' },
        { kind: 'indicator', tokenId: 't3', tooltip: 'indicator for reversal' },
        { kind: 'text', tokenId: 't4' },
      ],
    },
    {
      id: 's3',
      segments: [
        { kind: 'letters', letters: 'SIC' },
        { kind: 'definition', tokenIds: ['t4'] },
      ],
    },
  ],
}

/**
 * "Beat counter, frustrated (7)" → TROUNCE
 *
 * "Beat" = definition (at start)
 * "counter," = anagram fodder
 * "frustrated" = anagram indicator
 */
export const trounceExample: WordplayVisualization = {
  clue: 'Beat counter, frustrated (7)',
  answer: 'TROUNCE',
  tokens: [
    { id: 't1', text: 'Beat', role: 'definition' },
    { id: 't2', text: 'counter,', role: 'wordplay' },
    { id: 't3', text: 'frustrated', role: 'indicator' },
  ],
  stages: [
    {
      id: 's0',
      annotation: 'anagram of COUNTER',
      segments: [
        { kind: 'text', tokenId: 't1' },
        { kind: 'text', tokenId: 't2' },
        { kind: 'indicator', tokenId: 't3', tooltip: 'anagram indicator' },
      ],
    },
    {
      id: 's1',
      segments: [
        { kind: 'definition', tokenIds: ['t1'] },
        { kind: 'letters', letters: 'TROUNCE' },
      ],
    },
  ],
}

/**
 * "With Christmas nearly over recall dance's sleepy tune (7)" → LULLABY
 *
 * Christmas = YULE  (synonym, free)
 * nearly    → drop last letter → YUL  (deletion indicator)
 * over      → reverse → LUY           (reversal indicator)
 * dance     = BALL  (synonym, free)
 * recall    → reverse → LLAB          (reversal indicator)
 * With      → LUY contains LLAB → LULLABY  (container indicator)
 * sleepy tune = definition
 */
export const lullabyExample: WordplayVisualization = {
  clue: "With Christmas nearly over recall dance's sleepy tune (7)",
  answer: 'LULLABY',
  tokens: [
    { id: 't1', text: 'With', role: 'indicator' },
    { id: 't2', text: 'Christmas', role: 'wordplay' },
    { id: 't3', text: 'nearly', role: 'indicator' },
    { id: 't4', text: 'over', role: 'indicator' },
    { id: 't5', text: 'recall', role: 'indicator' },
    { id: 't6', text: 'dance', role: 'wordplay' },
    { id: 't7', text: 'sleepy tune', role: 'definition' },
  ],
  stages: [
    {
      // Synonym step: "Christmas" yellow, no indicator needed
      id: 's0',
      annotation: 'Christmas = YULE',
      segments: [
        { kind: 'text', tokenId: 't1' },
        { kind: 'text', tokenId: 't2' },
        { kind: 'text', tokenId: 't3' },
        { kind: 'text', tokenId: 't4' },
        { kind: 'text', tokenId: 't5' },
        { kind: 'text', tokenId: 't6' },
        { kind: 'text', tokenId: 't7' },
      ],
    },
    {
      // [YULE] yellow, "nearly" green — drop last letter
      id: 's1',
      annotation: 'YULE → nearly → YUL',
      segments: [
        { kind: 'text', tokenId: 't1' },
        { kind: 'letters', letters: 'YULE' },
        { kind: 'indicator', tokenId: 't3', tooltip: 'deletion indicator' },
        { kind: 'text', tokenId: 't4' },
        { kind: 'text', tokenId: 't5' },
        { kind: 'text', tokenId: 't6' },
        { kind: 'text', tokenId: 't7' },
      ],
    },
    {
      // [YUL] yellow, "over" green — reverse
      id: 's2',
      annotation: 'YUL → over → LUY',
      segments: [
        { kind: 'text', tokenId: 't1' },
        { kind: 'letters', letters: 'YUL' },
        { kind: 'indicator', tokenId: 't4', tooltip: 'reversal indicator' },
        { kind: 'text', tokenId: 't5' },
        { kind: 'text', tokenId: 't6' },
        { kind: 'text', tokenId: 't7' },
      ],
    },
    {
      // Synonym step: "dance" yellow, no indicator needed; [LUY] is stable
      id: 's3',
      annotation: 'dance = BALL',
      segments: [
        { kind: 'text', tokenId: 't1' },
        { kind: 'letters', letters: 'LUY' },
        { kind: 'text', tokenId: 't5' },
        { kind: 'text', tokenId: 't6' },
        { kind: 'text', tokenId: 't7' },
      ],
    },
    {
      // [BALL] yellow, "recall" green — reverse
      id: 's4',
      annotation: 'BALL → recall → LLAB',
      segments: [
        { kind: 'text', tokenId: 't1' },
        { kind: 'letters', letters: 'LUY' },
        { kind: 'indicator', tokenId: 't5', tooltip: 'reversal indicator' },
        { kind: 'letters', letters: 'BALL' },
        { kind: 'text', tokenId: 't7' },
      ],
    },
    {
      // "With" green (container), both [LUY] and [LLAB] yellow — merge
      id: 's5',
      annotation: 'LUY contains LLAB → LULLABY',
      segments: [
        { kind: 'indicator', tokenId: 't1', tooltip: 'container indicator' },
        { kind: 'letters', letters: 'LUY' },
        { kind: 'letters', letters: 'LLAB' },
        { kind: 'text', tokenId: 't7' },
      ],
    },
    {
      id: 's6',
      segments: [
        { kind: 'letters', letters: 'LULLABY' },
        { kind: 'definition', tokenIds: ['t7'] },
      ],
    },
  ],
}

/**
 * "He introduces many comedians at the start in full (5)" → EMCEE
 *
 * "He introduces" = definition (at start)
 * "many"       → initial letter → M   ("at the start" indicator)
 * "comedians"  → initial letter → C   ("at the start" indicator)
 * M, C → spell out names → EM, CEE   ("in full" indicator)
 * EM + CEE → join → EMCEE
 */
export const emceeExample: WordplayVisualization = {
  clue: 'He introduces many comedians at the start in full (5)',
  answer: 'EMCEE',
  tokens: [
    { id: 't1', text: 'He introduces', role: 'definition' },
    { id: 't2', text: 'many', role: 'wordplay' },
    { id: 't3', text: 'comedians', role: 'wordplay' },
    { id: 't4', text: 'at the start', role: 'indicator' },
    { id: 't5', text: 'in full', role: 'indicator' },
  ],
  stages: [
    {
      // Both "many" and "comedians" yellow; "at the start" green
      id: 's0',
      annotation: 'initials → M, C',
      segments: [
        { kind: 'text', tokenId: 't1' },
        { kind: 'text', tokenId: 't2' },
        { kind: 'text', tokenId: 't3' },
        { kind: 'indicator', tokenId: 't4', tooltip: 'initial letter indicator' },
        { kind: 'text', tokenId: 't5' },
      ],
    },
    {
      // Both [M] and [C] yellow; "in full" green
      id: 's1',
      annotation: 'M → EM, C → CEE → EMCEE',
      segments: [
        { kind: 'text', tokenId: 't1' },
        { kind: 'letters', letters: 'M' },
        { kind: 'letters', letters: 'C' },
        { kind: 'indicator', tokenId: 't5', tooltip: 'spell out letter names' },
      ],
    },
    {
      id: 's2',
      segments: [
        { kind: 'definition', tokenIds: ['t1'] },
        { kind: 'letters', letters: 'EMCEE' },
      ],
    },
  ],
}

/**
 * "Last character in home game ... (5)" → OMEGA
 *
 * "Last character" = definition
 * "in"             = hidden word indicator
 * "home game"      = container hiding OMEGA (hoME GAme)
 */
export const omegaExample: WordplayVisualization = {
  clue: 'Last character in home game ... (5)',
  answer: 'OMEGA',
  tokens: [
    { id: 't1', text: 'Last character', role: 'definition' },
    { id: 't2', text: 'in', role: 'indicator' },
    { id: 't3', text: 'home', role: 'wordplay' },
    { id: 't4', text: 'game', role: 'wordplay' },
  ],
  stages: [
    {
      // "home" and "game" both yellow; "in" green
      id: 's0',
      annotation: "OMEGA hidden in 'home game'",
      segments: [
        { kind: 'text', tokenId: 't1' },
        { kind: 'indicator', tokenId: 't2', tooltip: 'hidden word indicator' },
        { kind: 'text', tokenId: 't3' },
        { kind: 'text', tokenId: 't4' },
      ],
    },
    {
      id: 's1',
      segments: [
        { kind: 'definition', tokenIds: ['t1'] },
        { kind: 'letters', letters: 'OMEGA' },
      ],
    },
  ],
}

export const examples: ExampleEntry[] = [
  { label: 'SIC — reversal + abbreviation', data: sicExample },
  { label: 'TROUNCE — anagram', data: trounceExample },
  { label: 'LULLABY — deletion + reversal × 2 + container', data: lullabyExample },
  { label: 'EMCEE — initials + spell-out', data: emceeExample },
  { label: 'OMEGA — hidden word', data: omegaExample },
]
