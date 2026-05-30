import type { DisplayToken, Trigger } from './types'

export const normalize = (s: string) => s.replace(/[^a-zA-Z]/g, '').toUpperCase()

export const computeFns: Record<string, (s: string) => string> = {
  'trim-last':  (s) => s.slice(0, -1),
  'trim-first': (s) => s.slice(1),
  reverse:      (s) => [...s].reverse().join(''),
}

export function allInsertions(inner: string, outer: string): string[] {
  const out: string[] = []
  for (let i = 0; i <= outer.length; i++) out.push(outer.slice(0, i) + inner + outer.slice(i))
  return out
}

export function findTriggers(selectedTokens: DisplayToken[], triggers: Trigger[]): Trigger[] {
  const text = selectedTokens.map((t) => t.text).join(' ')
  return triggers.filter((trigger) => trigger.match === text)
}
