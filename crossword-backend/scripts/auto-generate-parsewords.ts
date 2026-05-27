/**
 * Auto-generate Parsewords puzzles for a given puzzle.
 *
 * Pipeline:
 *   1. Fetch all clue_explanations for the puzzle
 *   2. Identify wordplay/&lit explanations (have wordplay_steps to verify)
 *   3. Run verifyExplanation() to validate step-by-step correctness
 *   4. For verified clues not yet in parsewords_puzzles, generate puzzles
 *   5. BFS-validate each generated puzzle is solvable
 *   6. Save to parsewords_puzzles table (if --save)
 *
 * Usage:
 *   bun scripts/auto-generate-parsewords.ts --puzzle-id <id>
 *   bun scripts/auto-generate-parsewords.ts --puzzle-id <id> --count 4 --save
 *   bun scripts/auto-generate-parsewords.ts --puzzle-id <id> --dry-run
 *
 * Options:
 *   --puzzle-id <id>   Puzzle ID to process (required)
 *   --count <n>        Max parsewords puzzles to generate (default: 4)
 *   --save             Save generated puzzles to DB (default: dry-run)
 *   --model <slug>     Model for parsewords generation (default: deepseek-pro)
 */

import minimist from 'minimist'
import db from '../db-knex'
import { verifyExplanation, type ExplanationVerification } from '../utils/verifyExplanation'
import { generateParsewordsPuzzle, type ParsewordsPuzzle } from '../utils/parsewordsGenerator'
import { OPENROUTER_MODELS } from '../config'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExplanationRow {
  id: number
  puzzle_id: number
  clue_number: number
  direction: string
  clue_text: string
  answer: string
  explanation_json: string
}

interface ClueCandidate {
  row: ExplanationRow
  explanation: Record<string, unknown>
  clueType: string
  verification: ExplanationVerification
  alreadyHasParsewords: boolean
}

// ---------------------------------------------------------------------------
// BFS Parsewords Solver (ported from frontend validatePuzzle.ts)
// ---------------------------------------------------------------------------

type TokenRole = 'definition' | 'wordplay' | 'indicator' | 'link'

type TriggerAction =
  | { kind: 'replace'; options: string[] }
  | { kind: 'result'; options: string[] }
  | { kind: 'compute'; fn: 'trim-last' | 'trim-first' | 'reverse'; source: string }
  | { kind: 'container' }

type Trigger = { match: string; action: TriggerAction }

type PuzzleToken = { id?: string; text: string; role: TokenRole }

type Puzzle = {
  label: string
  clue: string
  answer: string
  tokens: PuzzleToken[]
  triggers: Trigger[]
}

const normalize = (s: string): string => s.replace(/[^a-zA-Z]/g, '').toUpperCase()

const computeFns: Record<string, (s: string) => string> = {
  'trim-last': (s) => s.slice(0, -1),
  'trim-first': (s) => s.slice(1),
  reverse: (s) => [...s].reverse().join(''),
}

function allInsertions(inner: string, outer: string): string[] {
  const out: string[] = []
  for (let i = 0; i <= outer.length; i++) {
    out.push(outer.slice(0, i) + inner + outer.slice(i))
  }
  return out
}

type SimToken = { id: string; text: string; role: string }

function tokenKey(tokens: SimToken[]): string {
  return tokens.map((t) => t.text).join('|')
}

function isWin(state: SimToken[], answer: string): boolean {
  const nonDef = state.filter((t) => t.role !== 'definition' && t.role !== 'link')
  return nonDef.length === 1 && normalize(nonDef[0].text) === normalize(answer)
}

type TriggerMatch = { trigger: Trigger; start: number; end: number }

function findMatchingTriggers(state: SimToken[], triggers: Trigger[]): TriggerMatch[] {
  const results: TriggerMatch[] = []
  for (const trigger of triggers) {
    const words = trigger.match.split(' ')
    for (let i = 0; i <= state.length - words.length; i++) {
      const slice = state.slice(i, i + words.length)
      if (slice.map((t) => t.text).join(' ') === trigger.match) {
        results.push({ trigger, start: i, end: i + words.length - 1 })
        break
      }
    }
  }
  return results
}

let opCounter = 0

function applyReplace(state: SimToken[], start: number, chosen: string): SimToken[] {
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
    const src = state
      .slice(start, end + 1)
      .find((t) => normalize(t.text) === normalize(action.source))
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

type PathStep = { match: string; chosen: string }

type ValidationResult =
  | { solvable: true; path: PathStep[] }
  | { solvable: false; reason: string }

const MAX_DEPTH = 30
const MAX_VISITED = 10_000

function validatePuzzle(puzzle: Puzzle): ValidationResult {
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
      return {
        solvable: false,
        reason: `Search exceeded ${MAX_VISITED} states — puzzle may be too complex or have cycles`,
      }
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

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const argv = minimist(Bun.argv.slice(2), {
    boolean: ['save', 'dry-run', 'help', 'force'],
    string: ['puzzle-id', 'count', 'model'],
    alias: { h: 'help' },
  })

  if (argv.help) {
    console.log(`Usage: bun scripts/auto-generate-parsewords.ts --puzzle-id <id> [options]

Pipeline: explanations → verify wordplay steps → generate parsewords → BFS validate → save

Options:
  --puzzle-id <id>   Puzzle ID to process (required)
  --count <n>        Max parsewords puzzles to generate (default: 4)
  --model <slug>     Model for parsewords generation (default: deepseek-pro)
  --save             Save generated puzzles to DB (default: dry-run preview)
  --force            Regenerate parsewords even if already saved for a clue
  --dry-run          Only show what would be processed, without generating

Examples:
  bun scripts/auto-generate-parsewords.ts --puzzle-id 3 --dry-run
  bun scripts/auto-generate-parsewords.ts --puzzle-id 3 --count 4 --save
  bun scripts/auto-generate-parsewords.ts --puzzle-id 3 --count 2 --model flash
`)
    process.exit(0)
  }

  const puzzleId = argv['puzzle-id'] ? parseInt(argv['puzzle-id'], 10) : null
  if (!puzzleId) {
    console.error('Error: --puzzle-id is required')
    process.exit(1)
  }

  const count = parseInt(argv['count'] ?? '4', 10)
  const save = argv['save'] ?? false
  const force = argv['force'] ?? false
  const dryRunOnly = argv['dry-run'] ?? false
  const modelKey = argv['model'] ?? 'deepseek-pro'
  const modelSlug =
    OPENROUTER_MODELS[modelKey as keyof typeof OPENROUTER_MODELS] ?? modelKey

  console.log('\n' + '='.repeat(70))
  console.log('Parsewords Auto-Generator')
  console.log('='.repeat(70))
  console.log(`  Puzzle ID:   ${puzzleId}`)
  console.log(`  Max count:   ${count}`)
  console.log(`  Model:       ${modelSlug}`)
  console.log(`  Save:        ${save}`)
  console.log(`  Force:       ${force}`)
  console.log()

  // ------------------------------------------------------------------
  // Step 1: Fetch all explanations for the puzzle
  // ------------------------------------------------------------------
  console.log('Step 1: Fetching clue explanations...')

  const rows = await db<ExplanationRow>('clue_explanations')
    .select('*')
    .where('puzzle_id', puzzleId)
    .orderBy('clue_number')

  if (rows.length === 0) {
    console.log('No clue explanations found for this puzzle. Run batch explanation first.')
    await db.destroy()
    return
  }

  // Fetch puzzle title for display
  const puzzle = await db('puzzles').select('title').where('id', puzzleId).first()
  const puzzleTitle = puzzle?.title ?? `puzzle ${puzzleId}`

  console.log(`  Puzzle:      ${puzzleTitle}`)
  console.log(`  Found ${rows.length} explanation(s)\n`)

  // ------------------------------------------------------------------
  // Step 2: Parse, classify, and verify
  // ------------------------------------------------------------------
  console.log('Step 2: Classifying and verifying explanations...\n')

  // Fetch existing parsewords for this puzzle
  const existingParsewords = await db('parsewords_puzzles')
    .select('clue_number', 'direction')
    .where('puzzle_id', puzzleId)

  const existingSet = new Set(
    existingParsewords.map((r: { clue_number: number; direction: string }) =>
      `${r.clue_number}|${r.direction}`,
    ),
  )

  const candidates: ClueCandidate[] = []

  for (const row of rows) {
    const key = `${row.clue_number}|${row.direction}`
    const alreadyHas = existingSet.has(key)

    let explanation: Record<string, unknown>
    try {
      explanation = JSON.parse(row.explanation_json)
    } catch {
      console.log(`  ⚠️  ${row.clue_number}${row.direction[0]}: parse error`)
      continue
    }

    const clueType = (explanation.clue_type as string) ?? 'unknown'
    const hasWordplay = clueType === 'wordplay' || clueType === '&lit'

    if (!hasWordplay) {
      console.log(`  ⬜ ${row.clue_number}${row.direction[0]} ${clueType.padEnd(18)} — no wordplay steps`)
      continue
    }

    const verification = verifyExplanation(explanation, row.clue_text, row.answer)

    const status = verification.verified ? '✅' : '❌'
    const ansInfo = verification.verified
      ? ''
      : verification.finalAnswerPresent
        ? ' (ans✓)'
        : ' (ans✗)'
    const skipInfo = alreadyHas && !force ? ' [has parsewords]' : ''
    console.log(
      `  ${status} ${row.clue_number.toString().padEnd(3)}${row.direction[0]} ${clueType.padEnd(18)}${ansInfo}${skipInfo}`,
    )

    if (verification.verified) {
      candidates.push({ row, explanation, clueType, verification, alreadyHasParsewords: alreadyHas })
    }
  }

  console.log(`\n  Verified wordplay candidates: ${candidates.length}`)

  const toGenerate = candidates.filter((c) => !c.alreadyHasParsewords || force)
  console.log(`  After skipping existing parsewords: ${toGenerate.length}`)
  console.log(`  Will generate up to: ${count}\n`)

  if (toGenerate.length === 0) {
    console.log('No candidates to generate. Done.')
    await db.destroy()
    return
  }

  if (dryRunOnly) {
    console.log('(Dry run — pass --save to generate and save)')
    await db.destroy()
    return
  }

  // ------------------------------------------------------------------
  // Step 3: Generate and validate parsewords puzzles
  // ------------------------------------------------------------------
  const toProcess = toGenerate.slice(0, count)

  console.log('='.repeat(70))
  console.log(`Step 3: Generating parsewords puzzles for ${toProcess.length} candidate(s)\n`)

  let generated = 0
  let failed = 0
  let saved = 0

  for (let i = 0; i < toProcess.length; i++) {
    const candidate = toProcess[i]
    const { row, explanation } = candidate
    const label = `${row.clue_number}${row.direction[0]}`

    console.log(`[${i + 1}/${toProcess.length}] ${label}`)

    // Generate
    let puzzle: ParsewordsPuzzle
    try {
      console.log(`  Generating via ${modelSlug}...`)
      const start = performance.now()
      puzzle = await generateParsewordsPuzzle(row.clue_text, row.answer, explanation, modelSlug)
      const elapsed = ((performance.now() - start) / 1000).toFixed(2)
      console.log(`  Generated in ${elapsed}s`)
    } catch (err: any) {
      console.log(`  ❌ Generation failed: ${err?.message ?? err}`)
      failed++
      continue
    }

    // Validate with BFS solver
    console.log(`  Validating puzzle solvability...`)
    const validation = validatePuzzle(puzzle as Puzzle)

    if (!validation.solvable) {
      console.log(`  ❌ Validation failed: ${validation.reason}`)
      console.log(`  Skipping — puzzle is not solvable.\n`)
      failed++
      continue
    }

    console.log(`  ✅ Solvable in ${validation.path.length} step(s)`)
    generated++

    // Save
    if (save) {
      try {
        await db('parsewords_puzzles')
          .insert({
            puzzle_id: puzzleId,
            clue_number: row.clue_number,
            direction: row.direction,
            puzzle_json: JSON.stringify(puzzle),
            updated_at: new Date(),
          })
          .onConflict(['puzzle_id', 'clue_number', 'direction'])
          .merge(['puzzle_json', 'updated_at'])

        console.log(`  💾 Saved to parsewords_puzzles.\n`)
        saved++
      } catch (err: any) {
        console.log(`  ❌ Save failed: ${err?.message ?? err}\n`)
        failed++
      }
    } else {
      console.log(`  (Dry-run: pass --save to write to DB)\n`)
    }
  }

  // ------------------------------------------------------------------
  // Summary
  // ------------------------------------------------------------------
  console.log('='.repeat(70))
  console.log(`Summary: generated=${generated}, saved=${saved}, failed=${failed}`)
  if (!save) {
    console.log('(Pass --save to write generated puzzles to DB)')
  }
  console.log('='.repeat(70))

  await db.destroy()
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
