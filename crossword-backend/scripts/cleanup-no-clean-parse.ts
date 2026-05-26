/**
 * Retry "no_clean_parse" clues with a stronger model via OpenRouter.
 *
 * Usage:
 *   bun scripts/cleanup-no-clean-parse.ts --puzzle-id <id> [options]
 *
 * Options:
 *   --puzzle-id <id>     Puzzle to process (required)
 *   --model <slug>       OpenRouter model (default: google/gemini-3.5-flash)
 *   --concurrency <n>    Max parallel requests (default: 4)
 *   --timeout <ms>       Per-request timeout ms (default: 90000)
 *   --dry-run            Preview which clues would be retried
 *   --save               Save successful results to DB (default: dry preview after run)
 */

import minimist from 'minimist'
import db from '../db-knex'
import { explainCrypticClue } from '../utils/openrouter'
import { ExplanationService } from '../services/explanationService'

// ---------------------------------------------------------------------------
// Semaphore
// ---------------------------------------------------------------------------

class Semaphore {
  private queue: (() => void)[] = []
  private running = 0
  constructor(private max: number) {}
  async acquire() {
    if (this.running < this.max) { this.running++; return }
    await new Promise<void>((r) => this.queue.push(r))
    this.running++
  }
  release() {
    this.running--
    this.queue.shift()?.()
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const argv = minimist(Bun.argv.slice(2), {
    boolean: ['dry-run', 'help'],
    string: ['puzzle-id', 'model', 'concurrency', 'timeout'],
    alias: { h: 'help' },
  })

  if (argv.help || !argv['puzzle-id']) {
    console.log(`Usage: bun scripts/cleanup-no-clean-parse.ts --puzzle-id <id> [options]

Options:
  --puzzle-id <id>     Puzzle to process (required)
  --model <slug>       OpenRouter model (default: google/gemini-3.5-flash)
  --concurrency <n>    Max parallel requests (default: 4)
  --timeout <ms>       Per-request timeout ms (default: 90000)
  --dry-run            Preview which clues would be retried without calling API`)
    process.exit(argv.help ? 0 : 1)
  }

  const puzzleId = parseInt(argv['puzzle-id'], 10)
  const model: string = argv['model'] ?? 'google/gemini-3.5-flash'
  const concurrency = parseInt(argv['concurrency'] ?? '4', 10)
  const timeoutMs = parseInt(argv['timeout'] ?? '90000', 10)
  const dryRun: boolean = argv['dry-run']

  console.log('\n' + '='.repeat(60))
  console.log('Cleanup: no_clean_parse retry')
  console.log('='.repeat(60))
  console.log(`  Puzzle:      ${puzzleId}`)
  console.log(`  Model:       ${model}`)
  console.log(`  Concurrency: ${concurrency}`)
  console.log(`  Timeout:     ${timeoutMs / 1000}s`)
  if (dryRun) console.log('  Mode:        DRY RUN')
  console.log()

  // Find all no_clean_parse clues for this puzzle
  const rows = await db('clue_explanations')
    .where('puzzle_id', puzzleId)
    .select('clue_number', 'direction', 'clue_text', 'answer', 'explanation_json')

  const targets = rows.filter((r: any) => {
    try { return JSON.parse(r.explanation_json)?.clue_type === 'no_clean_parse' }
    catch { return true }
  })

  if (targets.length === 0) {
    console.log('✅ No no_clean_parse clues found — nothing to do.')
    await db.destroy()
    return
  }

  console.log(`Found ${targets.length} no_clean_parse clue(s):\n`)
  for (const r of targets) {
    const issue = (() => { try { return JSON.parse(r.explanation_json)?.issue } catch { return null } })()
    console.log(`  ${r.clue_number}${r.direction[0].toUpperCase()} "${r.clue_text}" → ${r.answer}`)
    if (issue) console.log(`     Issue: ${issue.slice(0, 100)}`)
  }

  if (dryRun) {
    console.log('\n(Dry run — omit --dry-run to call the API)')
    await db.destroy()
    return
  }

  console.log(`\nRetrying ${targets.length} clue(s) with ${model}...\n`)

  const sem = new Semaphore(concurrency)
  let solved = 0, stillFailed = 0

  const tasks = targets.map(async (row: any) => {
    const label = `${row.clue_number}${row.direction[0].toUpperCase()}`
    await sem.acquire()
    try {
      const result = await explainCrypticClue({
        clue: row.clue_text,
        answer: row.answer,
        model,
        timeoutMs,
      })

      const clueType = result?.explanation?.clue_type ?? result?.clue_type
      const isClean = clueType && clueType !== 'no_clean_parse'

      if (isClean) {
        try {
          await ExplanationService.saveExplanation(
            puzzleId,
            row.clue_number,
            row.direction,
            row.clue_text,
            row.answer,
            result,
          )
          console.log(`  ✅ ${label} "${row.answer}" → ${clueType} (saved)`)
          solved++
        } catch (saveErr: any) {
          const msg = (saveErr?.message ?? String(saveErr)).split('\n')[0]
          console.log(`  ❌ ${label} "${row.answer}" → ${clueType} but save failed: ${msg}`)
          stillFailed++
        }
      } else {
        const issue = result?.explanation?.issue ?? result?.issue ?? '(still no clean parse)'
        console.log(`  ⚠️  ${label} "${row.answer}" → still no_clean_parse: ${issue.slice(0, 80)}`)
        stillFailed++
      }
    } catch (err: any) {
      const msg = (err?.message ?? String(err)).split('\n')[0]
      console.log(`  ❌ ${label} "${row.answer}": ${msg}`)
      stillFailed++
    } finally {
      sem.release()
    }
  })

  await Promise.allSettled(tasks)

  console.log('\n' + '='.repeat(60))
  console.log(`Solved: ${solved}  |  Still failed: ${stillFailed}`)
  console.log('='.repeat(60))

  await db.destroy()
}

main().catch((err) => { console.error(err); process.exit(1) })
