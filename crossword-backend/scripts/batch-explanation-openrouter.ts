/**
 * Concurrent batch explanation generation using OpenRouter.
 *
 * Replaces the OpenAI batch API workflow with concurrent real-time requests.
 * Results are saved to the DB as they arrive — no separate apply step needed.
 *
 * Usage:
 *   bun scripts/batch-explanation-openrouter.ts [options]
 *
 * Options:
 *   --puzzle-id <id>      Only process a specific puzzle (default: all)
 *   --concurrency <n>     Max parallel requests (default: 8)
 *   --model <name>        OpenRouter model slug (default: deepseek/deepseek-v4-pro)
 *   --timeout <ms>        Per-request timeout in ms (default: 90000)
 *   --dry-run             Preview what would be processed without calling the API
 *
 * Examples:
 *   bun scripts/batch-explanation-openrouter.ts --dry-run
 *   bun scripts/batch-explanation-openrouter.ts --puzzle-id 3
 *   bun scripts/batch-explanation-openrouter.ts --concurrency 4 --model deepseek/deepseek-v4-pro
 */

import minimist from 'minimist'
import db from '../db-knex'
import { explainCrypticClue } from '../utils/openrouter'
import { ExplanationService } from '../services/explanationService'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const rot13 = (str: string): string =>
  str.replace(/[a-zA-Z]/g, (c) => {
    const base = c <= 'Z' ? 65 : 97
    return String.fromCharCode(base + ((c.charCodeAt(0) - base + 13) % 26))
  })

interface PuzzleRow {
  id: number
  title: string
  clues: string
  answers_encrypted: string
  puzzle_number: number | null
}

interface Answer { number: number; answer: string }
interface ClueData { number: number; clue: string }
interface PuzzleClues { across: ClueData[]; down: ClueData[] }
interface PuzzleAnswers { across: Answer[]; down: Answer[] }

interface ClueJob {
  puzzleId: number
  puzzleTitle: string
  clueNumber: number
  direction: 'across' | 'down'
  clueText: string
  answer: string
}

// Simple semaphore for concurrency control
class Semaphore {
  private queue: (() => void)[] = []
  private running = 0

  constructor(private max: number) {}

  async acquire(): Promise<void> {
    if (this.running < this.max) {
      this.running++
      return
    }
    await new Promise<void>((resolve) => this.queue.push(resolve))
    this.running++
  }

  release(): void {
    this.running--
    const next = this.queue.shift()
    if (next) next()
  }
}

function isTimeoutError(err: any): boolean {
  return !!err?.message?.toLowerCase().includes('timed out')
}

function isRateLimitError(err: any): boolean {
  return (
    err?.message?.includes('429') ||
    err?.message?.toLowerCase().includes('rate limit') ||
    err?.message?.toLowerCase().includes('too many')
  )
}

function isTruncatedError(err: any): boolean {
  // max_tokens hit → server closes connection mid-JSON
  return !!err?.message?.toLowerCase().includes('unexpected eof')
}

// ---------------------------------------------------------------------------
// Build job list
// ---------------------------------------------------------------------------

async function buildJobs(puzzleIdFilter: number | null, puzzleTitleFilter: string | null, force: boolean): Promise<ClueJob[]> {
  const puzzles = await db<PuzzleRow>('puzzles')
    .select('id', 'title', 'clues', 'answers_encrypted', 'puzzle_number')
    .modify((qb) => {
      if (puzzleIdFilter !== null) qb.where('id', puzzleIdFilter)
      if (puzzleTitleFilter !== null) qb.whereLike('title', `%${puzzleTitleFilter}%`)
    })

  const jobs: ClueJob[] = []

  for (const puzzle of puzzles) {
    let clues: PuzzleClues
    let answers: PuzzleAnswers

    try {
      clues = JSON.parse(puzzle.clues)
      const encrypted = JSON.parse(puzzle.answers_encrypted || '{}')
      answers = {
        across: (encrypted.across || []).map((a: Answer) => ({ ...a, answer: rot13(a.answer) })),
        down: (encrypted.down || []).map((a: Answer) => ({ ...a, answer: rot13(a.answer) })),
      }
    } catch {
      console.warn(`  ⚠️  Skipping puzzle ${puzzle.id} "${puzzle.title}": failed to parse clues/answers`)
      continue
    }

    for (const dir of ['across', 'down'] as const) {
      for (const clue of clues[dir] || []) {
        const answerObj = answers[dir].find((a) => a.number === clue.number)
        if (!answerObj) continue

        const existing = await db('clue_explanations')
          .where({ puzzle_id: puzzle.id, clue_number: clue.number, direction: dir })
          .first()

        if (existing && !force) continue

        if (existing && force) {
          // Skip clues that already have new-format explanations (wordplay_steps with tokens[])
          try {
            const parsed = JSON.parse(existing.explanation_json)
            const steps = parsed?.wordplay_steps ?? parsed?.explanation?.wordplay_steps
            if (Array.isArray(steps?.[0]?.tokens)) continue
          } catch {
            // unparseable — regenerate it
          }
        }

        jobs.push({
          puzzleId: puzzle.id,
          puzzleTitle: puzzle.title,
          clueNumber: clue.number,
          direction: dir,
          clueText: clue.clue,
          answer: answerObj.answer,
        })
      }
    }
  }

  return jobs
}

// ---------------------------------------------------------------------------
// Process a single clue job
// ---------------------------------------------------------------------------

const FALLBACK_MODEL = 'openai/gpt-5.4-mini'

async function callWithRetry(
  clueText: string,
  answer: string,
  model: string,
  timeoutMs: number,
  label: string,
  maxAttempts = 3,
): Promise<unknown> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await explainCrypticClue({ clue: clueText, answer, model, timeoutMs })
    } catch (err: any) {
      if (isRateLimitError(err) && attempt < maxAttempts) {
        const delay = Math.min(2 ** attempt * 1000, 30_000)
        console.log(`  ⚠️  ${label}: 429 rate limit, retrying in ${delay / 1000}s (attempt ${attempt}/${maxAttempts})`)
        await new Promise((r) => setTimeout(r, delay))
        continue
      }
      throw err
    }
  }
  throw new Error('unreachable')
}

async function processJob(
  job: ClueJob,
  model: string,
  timeoutMs: number,
): Promise<'saved' | 'failed'> {
  const label = `P${job.puzzleId} ${job.clueNumber}${job.direction[0]!.toUpperCase()}`
  let result: unknown

  try {
    result = await callWithRetry(job.clueText, job.answer, model, timeoutMs, label)
  } catch (primaryErr: any) {
    const shouldFallback =
      model !== FALLBACK_MODEL && (isTimeoutError(primaryErr) || isTruncatedError(primaryErr))

    if (shouldFallback) {
      const reason = isTimeoutError(primaryErr) ? 'timeout' : 'truncated response'
      console.log(`  ⚠️  ${label}: ${reason} on ${model}, retrying with ${FALLBACK_MODEL}`)
      try {
        result = await callWithRetry(job.clueText, job.answer, FALLBACK_MODEL, timeoutMs, label)
      } catch (fallbackErr: any) {
        console.log(`  ❌ ${label} "${job.answer}": fallback also failed — ${fallbackErr?.message ?? fallbackErr}`)
        return 'failed'
      }
    } else {
      console.log(`  ❌ ${label} "${job.answer}": ${primaryErr?.message ?? primaryErr}`)
      return 'failed'
    }
  }

  try {
    await ExplanationService.saveExplanation(
      job.puzzleId,
      job.clueNumber,
      job.direction,
      job.clueText,
      job.answer,
      result as any,
    )
    return 'saved'
  } catch (saveErr: any) {
    console.log(`  ❌ ${label} "${job.answer}": save failed — ${saveErr?.message ?? saveErr}`)
    return 'failed'
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const argv = minimist(Bun.argv.slice(2), {
    boolean: ['dry-run', 'force', 'help'],
    string: ['model', 'puzzle-id', 'puzzle-title', 'concurrency', 'timeout'],
    alias: { h: 'help' },
  })

  if (argv.help) {
    console.log(`Usage: bun scripts/batch-explanation-openrouter.ts [options]

Options:
  --puzzle-id <id>       Only process a specific puzzle by ID
  --puzzle-title <str>   Only process puzzles whose title contains <str> (case-insensitive)
  --concurrency <n>      Max parallel requests (default: 8)
  --model <slug>         OpenRouter model (default: deepseek/deepseek-v4-pro)
  --timeout <ms>         Per-request timeout ms (default: 90000)
  --force                Overwrite existing explanations (default: skip already-saved clues)
  --dry-run              Preview without calling API`)
    process.exit(0)
  }

  const dryRun: boolean = argv['dry-run']
  const force: boolean = argv['force']
  const puzzleIdFilter: number | null = argv['puzzle-id'] ? parseInt(argv['puzzle-id'], 10) : null
  const puzzleTitleFilter: string | null = argv['puzzle-title'] ?? null
  const concurrency = parseInt(argv['concurrency'] ?? '8', 10)
  const model: string = argv['model'] ?? 'deepseek/deepseek-v4-pro'
  const timeoutMs = parseInt(argv['timeout'] ?? '90000', 10)

  console.log('\n' + '='.repeat(60))
  console.log('Batch Explanation Generator (OpenRouter)')
  console.log('='.repeat(60))
  console.log(`  Model:       ${model}`)
  console.log(`  Concurrency: ${concurrency}`)
  console.log(`  Timeout:     ${timeoutMs / 1000}s`)
  if (puzzleIdFilter !== null) console.log(`  Puzzle ID:    ${puzzleIdFilter}`)
  if (puzzleTitleFilter !== null) console.log(`  Puzzle title: "${puzzleTitleFilter}"`)
  if (force) console.log('  Force:        yes (overwrite existing)')
  if (dryRun) console.log('  Mode:         DRY RUN')
  console.log()

  console.log('Finding clues without explanations...')
  const jobs = await buildJobs(puzzleIdFilter, puzzleTitleFilter, force)

  if (jobs.length === 0) {
    console.log('✅ Nothing to do — all clues have explanations.')
    await db.destroy()
    return
  }

  // Group by puzzle for summary
  const byPuzzle = new Map<number, { title: string; count: number }>()
  for (const job of jobs) {
    const entry = byPuzzle.get(job.puzzleId) ?? { title: job.puzzleTitle, count: 0 }
    entry.count++
    byPuzzle.set(job.puzzleId, entry)
  }

  console.log(`Found ${jobs.length} clue(s) across ${byPuzzle.size} puzzle(s):\n`)
  for (const [id, { title, count }] of byPuzzle) {
    console.log(`  P${id} "${title}": ${count} clue(s)`)
  }

  if (dryRun) {
    console.log('\n(Dry run — pass without --dry-run to process)')
    await db.destroy()
    return
  }

  console.log(`\nProcessing ${jobs.length} clue(s) with concurrency=${concurrency}...\n`)

  const sem = new Semaphore(concurrency)
  let saved = 0
  let failed = 0
  let done = 0
  const startTime = Date.now()

  const tasks = jobs.map(async (job) => {
    await sem.acquire()
    try {
      const result = await processJob(job, model, timeoutMs)
      done++
      if (result === 'saved') {
        saved++
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(0)
        console.log(
          `  ✅ [${done}/${jobs.length}] P${job.puzzleId} ${job.clueNumber}${job.direction[0]!.toUpperCase()} "${job.answer}" (${elapsed}s elapsed)`,
        )
      } else {
        failed++
      }
    } finally {
      sem.release()
    }
  })

  await Promise.allSettled(tasks)

  const totalSeconds = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log('\n' + '='.repeat(60))
  console.log(`Done in ${totalSeconds}s — saved: ${saved}, failed: ${failed}`)
  console.log('='.repeat(60))

  await db.destroy()
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
