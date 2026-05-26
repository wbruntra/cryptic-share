/**
 * Batch verify all clue explanations.
 *
 * Walks through every clue_explanation in the database, runs
 * verifyExplanation() on each, and updates the verified/verified_at
 * columns. Only checks explanations with wordplay_steps (not
 * double_definition, cryptic_definition, or no_clean_parse).
 *
 * USAGE:
 *   bun run scripts/batch-verify-explanations.ts
 *   bun run scripts/batch-verify-explanations.ts --puzzle-id 76
 *   bun run scripts/batch-verify-explanations.ts --dry-run
 */

import db from '../db-knex'
import { verifyExplanation } from '../utils/verifyExplanation'

interface ExplanationRow {
  id: number
  puzzle_id: number
  clue_number: number
  direction: string
  clue_text: string
  answer: string
  explanation_json: string
}

async function main() {
  const argv = process.argv.slice(2)
  const dryRun = argv.includes('--dry-run')
  const puzzleIdArg = argv.find((a) => a.startsWith('--puzzle-id='))
  const puzzleIdFilter = puzzleIdArg ? parseInt(puzzleIdArg.split('=')[1], 10) : null

  const query = db<ExplanationRow>('clue_explanations').select('*').orderBy('puzzle_id').orderBy('clue_number')

  if (puzzleIdFilter) {
    query.where('puzzle_id', puzzleIdFilter)
  }

  const rows = await query
  console.log(`Found ${rows.length} explanation(s) to verify${dryRun ? ' (dry-run)' : ''}\n`)

  let verifiedCount = 0
  let failedCount = 0
  let skippedCount = 0

  for (const row of rows) {
    try {
      const data = JSON.parse(row.explanation_json)
      const result = verifyExplanation(data, row.clue_text, row.answer)

      const label = `P${row.puzzle_id} ${row.direction} ${row.clue_number}: ${row.answer}`

      if (result.error) {
        console.log(`  ⬜ ${label} — ${result.error}`)
        skippedCount++
        continue
      }

      if (result.verified) {
        console.log(`  ✅ ${label}`)
        if (!dryRun) {
          await db('clue_explanations')
            .where('id', row.id)
            .update({ verified: true, verified_at: db.fn.now() })
        }
        verifiedCount++
      } else {
        const failReasons = result.steps
          .filter((s) => !s.verified)
          .map((s) => `step ${s.stepIndex + 1}: ${s.detail}`)
          .join('; ')
        const ansInfo = result.finalAnswerPresent ? 'ans✓' : 'ans✗'
        console.log(`  ❌ ${label} ${ansInfo} — ${failReasons}`)
        if (!dryRun) {
          await db('clue_explanations')
            .where('id', row.id)
            .update({ verified: false, verified_at: db.fn.now() })
        }
        failedCount++
      }
    } catch (err: any) {
      console.error(`  ⚠️  Error processing row ${row.id}: ${err.message}`)
      skippedCount++
    }
  }

  console.log(`\n---`)
  console.log(`Verified: ${verifiedCount}, Failed: ${failedCount}, Skipped: ${skippedCount}`)
  console.log(`Total: ${rows.length}`)
  if (dryRun) {
    console.log('(dry-run — no database changes made)')
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal error:', err)
    process.exit(1)
  })
