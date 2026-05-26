import type { TokenRole } from '../wordplay/types'

export type { TokenRole }

export type TriggerAction =
  | { kind: 'replace'; options: string[] }
  | { kind: 'result'; options: string[] }
  | { kind: 'compute'; fn: 'trim-last' | 'trim-first' | 'reverse'; source: string }
  | { kind: 'container' }

export type Trigger = {
  match: string[]
  action: TriggerAction
}

export type PuzzleToken = {
  id: string
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
