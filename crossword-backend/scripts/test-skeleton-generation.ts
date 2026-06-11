/**
 * Test automatic skeleton generation for all wordplay explanations in a puzzle.
 *
 * For each wordplay/&lit explanation, deterministically builds a Parsewords
 * skeleton and BFS-validates it. No LLM calls — pure local computation.
 *
 * Usage:
 *   bun scripts/test-skeleton-generation.ts                      # puzzle 3 (default)
 *   bun scripts/test-skeleton-generation.ts --puzzle-id 5
 *   bun scripts/test-skeleton-generation.ts --puzzle-id 3 --verbose
 *   bun scripts/test-skeleton-generation.ts --puzzle-id 3 --save
 */

import minimist from 'minimist'
import db from '../db-knex'
import { buildSkeletonFromExplanation } from '../utils/parsewordsSkeleton'
import { validatePuzzle } from '../utils/parsewordsSolver'

const argv = minimist(Bun.argv.slice(2), {
  boolean: ['verbose', 'save'],
  string: ['puzzle-id'],
  alias: { p: 'puzzle-id', v: 'verbose', s: 'save' },
})

const puzzleId = parseInt(argv['puzzle-id'] ?? '3', 10)
const verbose = argv.verbose ?? false
const save = argv.save ?? false

const puzzle = await db('puzzles').where('id', puzzleId).select('title').first()
if (!puzzle) {
  console.error(`No puzzle found with id=${puzzleId}`)
  process.exit(1)
}

const rows = await db('clue_explanations')
  .where('puzzle_id', puzzleId)
  .orderBy('clue_number')
  .select('id', 'clue_text', 'answer', 'clue_number', 'direction', 'explanation_json')

console.log(`Puzzle ${puzzleId}: "${puzzle.title}"`)
console.log(`${rows.length} total explanations\n`)

type FailureReason = 'not-wordplay' | 'no-segmentation' | 'no-skeleton' | 'not-solvable'

const results: {
  label: string
  clue: string
  answer: string
  ok: boolean
  reason?: FailureReason
  steps?: number
  path?: string
}[] = []

for (const row of rows) {
  let explanation: Record<string, unknown>
  try {
    explanation = JSON.parse(row.explanation_json)
  } catch {
    continue
  }

  const label = `${row.clue_number}${row.direction[0]?.toUpperCase()}`
  const clueType = explanation.clue_type as string

  if (clueType !== 'wordplay' && clueType !== '&lit') {
    results.push({ label, clue: row.clue_text, answer: row.answer, ok: false, reason: 'not-wordplay' })
    continue
  }

  const seg = explanation.clue_segmentation
  if (!seg) {
    results.push({ label, clue: row.clue_text, answer: row.answer, ok: false, reason: 'no-segmentation' })
    continue
  }

  const skeleton = buildSkeletonFromExplanation(explanation, row.clue_text, row.answer)
  if (!skeleton) {
    results.push({ label, clue: row.clue_text, answer: row.answer, ok: false, reason: 'no-skeleton' })
    continue
  }

  const validation = validatePuzzle(skeleton)
  if (!validation.solvable) {
    results.push({
      label, clue: row.clue_text, answer: row.answer, ok: false, reason: 'not-solvable',
      steps: skeleton.triggers.length,
      path: skeleton.triggers.map(t => `"${t.match}"`).join(', '),
    })
    continue
  }

  const path = (validation as any).path as { match: string; chosen: string }[]
  results.push({
    label, clue: row.clue_text, answer: row.answer, ok: true,
    steps: path.length,
    path: path.map(p => `${p.match}→${p.chosen}`).join(', '),
  })

  if (save) {
    await db('parsewords_puzzles')
      .insert({
        puzzle_id: puzzleId,
        clue_number: row.clue_number,
        direction: row.direction,
        puzzle_json: JSON.stringify(skeleton),
        updated_at: new Date(),
      })
      .onConflict(['puzzle_id', 'clue_number', 'direction'])
      .merge(['puzzle_json', 'updated_at'])
  }
}

// ---------------------------------------------------------------------------
// Print results
// ---------------------------------------------------------------------------

const ok = results.filter(r => r.ok)
const fail = results.filter(r => !r.ok)

console.log('PASSED ' + '─'.repeat(60))
for (const r of ok) {
  console.log(`  ✅ ${r.label.padEnd(5)} ${r.answer.padEnd(18)} ${r.steps} step(s)`)
  if (verbose) console.log(`       ${r.path}`)
}

if (fail.length > 0) {
  console.log('\nFAILED ' + '─'.repeat(60))
  for (const r of fail) {
    const detail = r.reason === 'not-solvable'
      ? `triggers: ${r.path}`
      : r.reason
    console.log(`  ❌ ${r.label.padEnd(5)} ${r.answer.padEnd(18)} [${detail}]`)
    if (verbose && r.reason === 'not-solvable') {
      console.log(`       trigger matches: ${r.path}`)
    }
  }
}

console.log('\n' + '='.repeat(68))
const wordplay = results.filter(r => r.reason !== 'not-wordplay')
console.log(
  `Wordplay clues: ${wordplay.length}  |  ` +
  `Skeleton solvable: ${ok.length}  |  ` +
  `Failed: ${fail.filter(r => r.reason !== 'not-wordplay').length}  |  ` +
  `Success rate: ${Math.round((ok.length / Math.max(wordplay.length, 1)) * 100)}%`
)

if (save) {
  console.log(`Saved ${ok.length} skeleton(s) to parsewords_puzzles.`)
} else if (ok.length > 0) {
  console.log('Run with --save to write these skeletons to parsewords_puzzles.')
}

await db.destroy()
