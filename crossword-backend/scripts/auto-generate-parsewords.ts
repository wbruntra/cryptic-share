/**
 * Auto-generate Parsewords puzzles for a given puzzle.
 *
 * Pipeline:
 *   1. Fetch all clue_explanations for the puzzle
 *   2. Identify wordplay/&lit explanations (have wordplay_steps to verify)
 *   3. Run verifyExplanation() to validate step-by-step correctness
 *   4. For verified clues not yet in parsewords_puzzles, generate puzzles
 *   5. BFS-validate each generated puzzle is solvable
 *   6. Save to parsewords_puzzles table (unless --dry-run)
 *
 * Usage:
 *   bun scripts/auto-generate-parsewords.ts                         # uses most recent puzzle
 *   bun scripts/auto-generate-parsewords.ts --puzzle-title "Ham"    # partial match ok
 *   bun scripts/auto-generate-parsewords.ts --puzzle-title "Hamlet" --book 3 --count 4
 *   bun scripts/auto-generate-parsewords.ts --puzzle-title "Hamlet" --dry-run
 *
 * Options:
 *   --puzzle-title <t>  Puzzle title to process (partial match; default: most recent)
 *   --book <b>          Book number to search in (default: 3)
 *   --count <n>         Max parsewords puzzles to generate (default: 4)
 *   --dry-run           Preview without saving to DB
 *   --model <slug>      Model for parsewords generation (default: deepseek-pro)
 */

import minimist from 'minimist'
import db from '../db-knex'
import { verifyExplanation, type ExplanationVerification } from '../utils/verifyExplanation'
import { generateParsewordsPuzzle, type ParsewordsPuzzle } from '../utils/parsewordsGenerator'
import { validatePuzzle } from '../utils/parsewordsSolver'
import { OPENROUTER_MODELS } from '../config'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PuzzleRow {
  id: number
  title: string
  puzzle_number: number | null
  book: string | null
}

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
// Puzzle lookup
// ---------------------------------------------------------------------------

async function resolveMostRecentPuzzleId(book: string): Promise<{ id: number; title: string }> {
  // Use the puzzle that most recently had a clue_explanation inserted
  const row = await db('clue_explanations')
    .join('puzzles', 'puzzles.id', 'clue_explanations.puzzle_id')
    .where('puzzles.book', book)
    .orderBy('clue_explanations.id', 'desc')
    .select('puzzles.id', 'puzzles.title')
    .first()
  if (!row) {
    throw new Error(`No puzzles with clue explanations found in book ${book}`)
  }
  return row
}

async function resolvePuzzleId(puzzleTitle: string, book: string): Promise<number> {
  const matches = await db<PuzzleRow>('puzzles')
    .select('id', 'title', 'book', 'puzzle_number')
    .where('book', book)
    .whereRaw('LOWER(title) LIKE LOWER(?)', [`%${puzzleTitle}%`])

  if (matches.length === 0) {
    throw new Error(`No puzzle found matching "${puzzleTitle}" in book ${book}`)
  }
  if (matches.length > 1) {
    const list = matches.map((p) => `  ID ${p.id}: "${p.title}" (P#${p.puzzle_number ?? '—'})`).join('\n')
    throw new Error(`Multiple puzzles match "${puzzleTitle}" in book ${book}:\n${list}\nBe more specific.`)
  }
  const match = matches[0]!
  console.log(`  Resolved puzzle: ID ${match.id} — "${match.title}"`)
  return match.id
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const argv = minimist(Bun.argv.slice(2), {
    boolean: ['dry-run', 'help', 'force'],
    string: ['puzzle-title', 'book', 'count', 'model'],
    alias: { h: 'help', t: 'puzzle-title', b: 'book', n: 'count', m: 'model' },
  })

  if (argv.help) {
    console.log(`Usage: bun scripts/auto-generate-parsewords.ts [options]

Pipeline: explanations → verify wordplay steps → generate parsewords → BFS validate → save

Options:
  --puzzle-title <t>  Puzzle title to process (partial match; default: most recent)
  --book <b>          Book number to search in (default: 3)
  --count <n>         Max parsewords puzzles to generate (default: 4)
  --model <slug>      Model for parsewords generation (default: deepseek-pro)
  --force             Regenerate parsewords even if already saved for a clue
  --dry-run           Preview without saving to DB

Examples:
  bun scripts/auto-generate-parsewords.ts
  bun scripts/auto-generate-parsewords.ts --puzzle-title "Ham"
  bun scripts/auto-generate-parsewords.ts --puzzle-title "Hamlet" --count 2 --model flash
  bun scripts/auto-generate-parsewords.ts --puzzle-title "Hamlet" --dry-run
`)
    process.exit(0)
  }

  const puzzleTitleFilter: string | null = argv['puzzle-title'] || null
  const book: string = argv['book'] || '3'

  let puzzleId: number
  if (puzzleTitleFilter) {
    puzzleId = await resolvePuzzleId(puzzleTitleFilter, book)
  } else {
    const recent = await resolveMostRecentPuzzleId(book)
    console.log(`  No --puzzle-title given; using most recent: "${recent.title}"`)
    puzzleId = recent.id
  }

  const count = parseInt(argv['count'] ?? '4', 10)
  const save = true
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

  // Shuffle and pick up to `count` candidates at random
  function shuffleArray<T>(arr: T[]): T[] {
    const out = [...arr]
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      const tmp = out[i]!
      out[i] = out[j]!
      out[j] = tmp
    }
    return out
  }

  const toProcess = shuffleArray(toGenerate).slice(0, count)

  console.log('='.repeat(70))
  console.log(`Step 3: Generating parsewords puzzles for ${toProcess.length} candidate(s)\n`)

  let generated = 0
  let failed = 0
  let saved = 0

  for (let i = 0; i < toProcess.length; i++) {
    const candidate = toProcess[i]!
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
    const validation = validatePuzzle(puzzle)

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
      console.log(`  (Dry-run: remove --dry-run to write to DB)\n`)
    }
  }

  // ------------------------------------------------------------------
  // Summary
  // ------------------------------------------------------------------
  console.log('='.repeat(70))
  console.log(`Summary: generated=${generated}, saved=${saved}, failed=${failed}`)
  if (dryRunOnly) {
    console.log('(Dry run — remove --dry-run to save to DB)')
  }
  console.log('='.repeat(70))

  await db.destroy()
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
