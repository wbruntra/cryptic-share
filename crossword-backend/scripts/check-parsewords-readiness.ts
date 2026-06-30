/**
 * Check which puzzles have explanations with `clue_segmentation`
 * (the format required for Parsewords skeleton generation).
 *
 * Usage:
 *   bun scripts/check-parsewords-readiness.ts
 *   bun scripts/check-parsewords-readiness.ts --book 3
 *   bun scripts/check-parsewords-readiness.ts --puzzle-id 128
 */

import minimist from 'minimist'
import db from '../db-knex'

interface PuzzleInfo {
  id: number
  title: string
  book: string | null
  puzzle_number: number | null
  totalExplanations: number
  withSegmentation: number
  wordplayCount: number
  alreadyHasParsewords: number
}

function hasSegmentation(explanationJson: string): boolean {
  try {
    const parsed = JSON.parse(explanationJson)
    return Array.isArray(parsed.clue_segmentation) && parsed.clue_segmentation.length > 0
  } catch {
    return false
  }
}

function isWordplayOrAndlit(explanationJson: string): boolean {
  try {
    const parsed = JSON.parse(explanationJson)
    const ct = parsed.clue_type
    return ct === 'wordplay' || ct === '&lit'
  } catch {
    return false
  }
}

function hasWordplaySteps(explanationJson: string): boolean {
  try {
    const parsed = JSON.parse(explanationJson)
    return Array.isArray(parsed.wordplay_steps) && parsed.wordplay_steps.length > 0
  } catch {
    return false
  }
}

async function main() {
  const argv = minimist(Bun.argv.slice(2), {
    boolean: ['help', 'all', 'detailed'],
    string: ['book', 'puzzle-id'],
    alias: { h: 'help', b: 'book', p: 'puzzle-id', d: 'detailed' },
  })

  if (argv.help) {
    console.log(`Usage: bun scripts/check-parsewords-readiness.ts [options]

Check which puzzles are ready for Parsewords puzzle generation.
A puzzle is "ready" when its explanations include clue_segmentation.

Options:
  --book <b>      Filter by book number (default: all)
  --puzzle-id <p> Check a specific puzzle
  --all           Show all puzzles, not just those with any explanations
  --detailed      Show per-clue details for each puzzle

Examples:
  bun scripts/check-parsewords-readiness.ts
  bun scripts/check-parsewords-readiness.ts --book 3
  bun scripts/check-parsewords-readiness.ts --puzzle-id 128 --detailed
`)
    process.exit(0)
  }

  // Fetch all explanations grouped by puzzle
  let query = db('clue_explanations')
    .select('puzzle_id', 'explanation_json', 'clue_number', 'direction')
    .orderBy('puzzle_id')
    .orderBy('clue_number')

  if (argv['puzzle-id']) {
    query = query.where('puzzle_id', parseInt(argv['puzzle-id'], 10))
  }

  const rows = await query

  if (argv['puzzle-id']) {
    const puz = await db('puzzles')
      .select('id', 'title', 'book', 'puzzle_number')
      .where('id', parseInt(argv['puzzle-id'], 10))
      .first()
    if (!puz) {
      console.error(`Puzzle ${argv['puzzle-id']} not found`)
      await db.destroy()
      process.exit(1)
    }
  }

  // Fetch parsewords counts
  const parsewordsRows = await db('parsewords_puzzles')
    .select('puzzle_id')
    .count('* as count')
    .groupBy('puzzle_id')
  const parsewordsCounts = new Map<number, number>()
  for (const r of parsewordsRows) {
    parsewordsCounts.set(r.puzzle_id, (r as any).count)
  }

  // Group by puzzle
  const puzzleMap = new Map<number, { total: number; withSeg: number; wordplay: number; details: { clueNumber: number; direction: string; hasSeg: boolean; hasSteps: boolean }[] }>()

  for (const row of rows) {
    const pid = row.puzzle_id
    if (!puzzleMap.has(pid)) {
      puzzleMap.set(pid, { total: 0, withSeg: 0, wordplay: 0, details: [] })
    }
    const info = puzzleMap.get(pid)!
    info.total++

    const seg = hasSegmentation(row.explanation_json)
    const wp = isWordplayOrAndlit(row.explanation_json)
    const steps = hasWordplaySteps(row.explanation_json)

    if (seg) info.withSeg++
    if (wp) info.wordplay++

    if (argv.detailed) {
      info.details.push({
        clueNumber: row.clue_number,
        direction: row.direction,
        hasSeg: seg,
        hasSteps: steps,
      })
    }
  }

  // Get puzzle titles
  const puzzleIds = [...puzzleMap.keys()]
  if (puzzleIds.length === 0) {
    console.log('No explanations found.')
    await db.destroy()
    return
  }

  const puzzles = await db('puzzles')
    .select('id', 'title', 'book', 'puzzle_number')
    .whereIn('id', puzzleIds)
    .orderBy('puzzle_number', 'desc')

  // Filter by book if specified
  let filteredPuzzles = puzzles
  if (argv['book']) {
    const bookFilter = String(argv['book'])
    filteredPuzzles = puzzles.filter((p: any) => String(p.book) === bookFilter)
    if (filteredPuzzles.length === 0) {
      console.log(`No puzzles found in book ${argv['book']}`)
      await db.destroy()
      return
    }
  }

  // Display
  console.log('')
  console.log('='.repeat(80))
  console.log('PARSEWORDS READINESS CHECK')
  console.log('='.repeat(80))
  console.log('')

  // Readiness: a puzzle is "ready" when ALL wordplay/&lit clues have clue_segmentation
  let fullyReady = 0
  let partiallyReady = 0
  let notReady = 0
  let readyPuzzles: PuzzleInfo[] = []
  let partialPuzzles: PuzzleInfo[] = []

  for (const p of filteredPuzzles) {
    const info = puzzleMap.get(p.id)
    if (!info) {
      if (argv.all) {
        console.log(`  Puzzle #${p.puzzle_number ?? p.id} "${p.title}" — no explanations yet`)
      }
      notReady++
      continue
    }

    const pwCount = parsewordsCounts.get(p.id) ?? 0
    const percent = info.total > 0 ? Math.round((info.withSeg / info.total) * 100) : 0

    let status: string
    if (info.withSeg === info.total && info.total > 0) {
      status = '✅ READY'
      fullyReady++
      readyPuzzles.push({
        id: p.id,
        title: p.title,
        book: p.book as string | null,
        puzzle_number: p.puzzle_number as number | null,
        totalExplanations: info.total,
        withSegmentation: info.withSeg,
        wordplayCount: info.wordplay,
        alreadyHasParsewords: pwCount,
      })
    } else if (info.withSeg > 0) {
      status = '🟡 PARTIAL'
      partiallyReady++
      partialPuzzles.push({
        id: p.id,
        title: p.title,
        book: p.book as string | null,
        puzzle_number: p.puzzle_number as number | null,
        totalExplanations: info.total,
        withSegmentation: info.withSeg,
        wordplayCount: info.wordplay,
        alreadyHasParsewords: pwCount,
      })
    } else {
      status = '❌ NOT READY'
      notReady++
    }

    console.log(`  ${status}  #${String(p.puzzle_number ?? p.id).padEnd(5)} "${p.title}" — ${info.withSeg}/${info.total} explanations have clue_segmentation (${info.wordplay} wordplay, ${pwCount} parsewords saved)`)

    if (argv.detailed && info.details.length > 0) {
      for (const d of info.details) {
        const segMark = d.hasSeg ? '✓' : '✗'
        const stepMark = d.hasSteps ? '✓' : '✗'
        console.log(`         ${String(d.clueNumber).padEnd(3)}${d.direction[0]}  seg=${segMark}  steps=${stepMark}`)
      }
    }
  }

  console.log('')
  console.log(`Summary: ${fullyReady} ready, ${partiallyReady} partial, ${notReady} not ready`)

  if (readyPuzzles.length > 0) {
    console.log('')
    console.log('Ready puzzles (run auto-generate-parsewords with these):')
    for (const p of readyPuzzles) {
      const rec = `  bun scripts/auto-generate-parsewords.ts --puzzle-title "${p.title}"`
      if (p.alreadyHasParsewords > 0) {
        console.log(`  ${rec}  (${p.alreadyHasParsewords} parsewords already saved)`)
      } else {
        console.log(`  ${rec}`)
      }
    }
  }

  if (partialPuzzles.length > 0) {
    console.log('')
    console.log('Partially ready (need explanation regeneration):')
    for (const p of partialPuzzles) {
      console.log(`  #${p.puzzle_number ?? p.id} "${p.title}" — ${p.withSegmentation}/${p.totalExplanations} segmented`)
    }
  }

  console.log('')

  await db.destroy()
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
