import type { TokenRole } from '../wordplay/types'

export type { TokenRole }

export type CrypticType =
  | 'anagram'
  | 'synonym'
  | 'reversal'
  | 'trim'
  | 'deletion'
  | 'container'
  | 'hidden'
  | 'homophone'
  | 'initials'
  | 'charade'
  | 'definition'

export const CRYPTIC_DISPLAY: Record<CrypticType, string> = {
  anagram:    'Anagram',
  synonym:    'Synonym',
  reversal:   'Reversal',
  trim:       'Trim',
  deletion:   'Deletion',
  container:  'Container',
  hidden:     'Hidden word',
  homophone:  'Homophone',
  initials:   'Initials',
  charade:    'Charade',
  definition: 'Definition',
}

export type TriggerAction =
  | { kind: 'replace'; options: string[]; label?: CrypticType }
  | { kind: 'result'; options: string[]; label?: CrypticType }
  | { kind: 'compute'; fn: 'trim-last' | 'trim-first' | 'reverse'; source: string; label?: CrypticType }
  | { kind: 'container'; label?: CrypticType }

export type Trigger = {
  match: string
  action: TriggerAction
}

export type PuzzleToken = {
  id?: string
  text: string
  role: TokenRole
}

export type Puzzle = {
  label: string
  clue: string
  answer: string
  displayAnswer?: string
  tokens: PuzzleToken[]
  triggers: Trigger[]
}

export type DisplayToken = { id: string; text: string; role: TokenRole }
