/**
 * (Re)generate wordplay explanations for a puzzle from scratch and test
 * whether each can be turned into a Parsewords skeleton.
 *
 * For each wordplay/&lit clue we:
 *   1. Generate a fresh explanation with gpt-5-mini from ONLY the clue + answer
 *      (we deliberately do NOT feed any prior, unverified explanation).
 *   2. Build a skeleton Parsewords puzzle deterministically.
 *   3. BFS-validate that the skeleton is solvable.
 *   4. With --save: persist the new explanation to clue_explanations.
 *
 * Usage:
 *   bun scripts/reformat-explanations-puzzle3.ts                  # puzzle 3, dry run
 *   bun scripts/reformat-explanations-puzzle3.ts --save           # persist explanations
 *   bun scripts/reformat-explanations-puzzle3.ts --puzzle-id 5
 *   bun scripts/reformat-explanations-puzzle3.ts --only 5D,7D     # restrict to clues
 */

import db from '../db-knex'
import { explainCrypticClue } from '../utils/openai'
import { buildSkeletonFromExplanation } from '../utils/parsewordsSkeleton'
import { validatePuzzle } from '../utils/parsewordsSolver'

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const save = Bun.argv.includes('--save')

  const puzzleIdArg = Bun.argv.find((a) => a.startsWith('--puzzle-id='))?.split('=')[1]
    ?? (Bun.argv.includes('--puzzle-id') ? Bun.argv[Bun.argv.indexOf('--puzzle-id') + 1] : undefined)
  const puzzleId = parseInt(puzzleIdArg ?? '3', 10)

  // Optional: --only 5D,7D,12D   (restrict to specific clue labels)
  const onlyArg = Bun.argv.find((a) => a.startsWith('--only='))?.split('=')[1]
    ?? (Bun.argv.includes('--only') ? Bun.argv[Bun.argv.indexOf('--only') + 1] : undefined)
  const onlySet = onlyArg ? new Set(onlyArg.toUpperCase().split(',').map((s) => s.trim())) : null

  const rows = await db('clue_explanations')
    .where('puzzle_id', puzzleId)
    .orderBy('clue_number')
    .select('id', 'clue_text', 'answer', 'clue_number', 'direction', 'explanation_json')

  // Only attempt clues that the solver previously classified as wordplay/&lit
  // (i.e. not no_clean_parse / double_definition / cryptic_definition).
  const eligible = rows.filter((r: any) => {
    if (onlySet) {
      const label = `${r.clue_number}${r.direction[0]?.toUpperCase()}`
      if (!onlySet.has(label)) return false
    }
    try {
      const exp = JSON.parse(r.explanation_json)
      return exp.clue_type === 'wordplay' || exp.clue_type === '&lit'
    } catch {
      return false
    }
  })

  console.log(`Puzzle ${puzzleId}: ${rows.length} total explanations, ${eligible.length} wordplay/&lit\n`)
  console.log('='.repeat(70))

  let apiOk = 0
  let apiFailed = 0
  let skeletonOk = 0
  let skeletonFailed = 0

  for (let i = 0; i < eligible.length; i++) {
    const row = eligible[i]
    const label = `${row.clue_number}${row.direction[0]?.toUpperCase()}`

    console.log(`\n[${i + 1}/${eligible.length}] ${label}: ${row.clue_text}`)
    console.log(`  Answer: ${row.answer}`)

    // ------------------------------------------------------------------
    // Step 1: Generate fresh explanation (clue + answer only)
    // ------------------------------------------------------------------
    let result: Record<string, unknown>
    try {
      const start = performance.now()
      result = await explainCrypticClue({ clue: row.clue_text, answer: row.answer })
      const elapsed = ((performance.now() - start) / 1000).toFixed(2)
      console.log(`  ✅ Generated in ${elapsed}s  (clue_type: ${result.clue_type})`)
      apiOk++
    } catch (err: any) {
      console.log(`  ❌ API error: ${err?.message ?? err}`)
      apiFailed++
      continue
    }

    // The top-level response is { clue_type, explanation }
    const newExp = (result as any).explanation as Record<string, unknown> | undefined
    if (!newExp) {
      console.log('  ❌ Response has no "explanation" field')
      skeletonFailed++
      continue
    }

    // ------------------------------------------------------------------
    // Step 2: Build skeleton
    // ------------------------------------------------------------------
    const skeleton = buildSkeletonFromExplanation(newExp, row.clue_text, row.answer)
    let solvable = false
    if (!skeleton) {
      console.log(`  ❌ Could not build skeleton (clue_type now: ${newExp.clue_type})`)
      skeletonFailed++
    } else {
      // ----------------------------------------------------------------
      // Step 3: BFS-validate
      // ----------------------------------------------------------------
      const validation = validatePuzzle(skeleton)
      if (validation.solvable) {
        solvable = true
        const path = (validation as any).path as { match: string; chosen: string }[]
        console.log(`  ✅ Skeleton solvable — ${path.length} trigger(s): ${path.map(p => `"${p.match}"→${p.chosen}`).join(', ')}`)
        skeletonOk++
      } else {
        console.log(`  ❌ Skeleton not solvable: ${(validation as any).reason}`)
        for (const t of skeleton.triggers) {
          console.log(`    match="${t.match}"  action=${JSON.stringify(t.action)}`)
        }
        skeletonFailed++
      }
    }

    // ------------------------------------------------------------------
    // Step 4: Save the regenerated explanation — ONLY if its skeleton
    // validates, so we never overwrite a good explanation with a worse one.
    // ------------------------------------------------------------------
    if (save && solvable) {
      await db('clue_explanations')
        .where('id', row.id)
        .update({ explanation_json: JSON.stringify(newExp) })
      console.log('  💾 Saved regenerated explanation to DB')
    } else if (save) {
      console.log('  ⏭️  Not saved (skeleton did not validate; keeping prior explanation)')
    }
  }

  console.log('\n' + '='.repeat(70))
  console.log('Summary')
  console.log(`  API calls:    ${apiOk} OK, ${apiFailed} failed`)
  console.log(`  Skeletons:    ${skeletonOk} solvable, ${skeletonFailed} not solvable`)
  if (!save && skeletonOk > 0) {
    console.log('\nRun with --save to persist regenerated explanations to DB.')
  }

  await db.destroy()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
