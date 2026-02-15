import db from '../db-knex'
import { extractClueMetadata, rot13, type CellType, type Direction } from '../utils/answerChecker'
import { parseGridString } from '../utils/gridIntegrityChecker'

type AnswerEntry = { number: number; answer: string }

function normalize(text: string): string {
  return text.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function getChar(state: string[], r: number, c: number): string {
  const row = state[r] ?? ''
  const ch = row[c] ?? ''
  return ch === ' ' ? '' : ch.toUpperCase()
}

function extractWord(grid: CellType[][], state: string[], row: number, col: number, direction: Direction): string {
  let r = row
  let c = col
  let out = ''
  while (r < grid.length && c < grid[0]!.length && grid[r]![c] !== 'B') {
    out += getChar(state, r, c)
    if (direction === 'across') c++
    else r++
  }
  return normalize(out)
}

function countFilled(grid: CellType[][], state: string[]): number {
  let count = 0
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[0]!.length; c++) {
      if (grid[r]![c] === 'B') continue
      if (getChar(state, r, c)) count++
    }
  }
  return count
}

async function main() {
  const titles = process.argv.slice(2)
  if (titles.length === 0) {
    console.error('Usage: bun run scripts/check-answer-drift-by-title.ts <title...>')
    process.exit(1)
  }

  const puzzles = await db('puzzles')
    .select('id', 'title', 'grid', 'answers_encrypted')
    .whereIn('title', titles)
    .whereNotNull('answers_encrypted')
    .orderBy('id', 'asc')

  for (const puzzle of puzzles) {
    const grid = parseGridString(puzzle.grid)
    const metadata = extractClueMetadata(grid)
    const totalLetters = grid.flat().filter((x) => x !== 'B').length

    const answers = JSON.parse(puzzle.answers_encrypted)
    const byAcross = new Map<number, string>(
      ((answers.across ?? []) as AnswerEntry[]).map((a) => [a.number, normalize(rot13(a.answer))]),
    )
    const byDown = new Map<number, string>(
      ((answers.down ?? []) as AnswerEntry[]).map((a) => [a.number, normalize(rot13(a.answer))]),
    )

    const sessions = await db('puzzle_sessions')
      .select('session_id', 'state', 'updated_at')
      .where({ puzzle_id: puzzle.id })
      .orderBy('updated_at', 'desc')

    let best: { sessionId: string; state: string[]; filled: number } | null = null

    for (const s of sessions) {
      let parsed: unknown
      try {
        parsed = JSON.parse(s.state)
      } catch {
        continue
      }
      if (!Array.isArray(parsed) || !parsed.every((x) => typeof x === 'string')) continue

      const filled = countFilled(grid, parsed)
      if (!best || filled > best.filled) {
        best = { sessionId: s.session_id, state: parsed, filled }
      }
    }

    console.log(`\nPuzzle id=${puzzle.id}, title=${puzzle.title}`)

    if (!best) {
      console.log('  No parseable sessions found')
      continue
    }

    console.log(`  Best session=${best.sessionId} filled=${best.filled}/${totalLetters}`)

    let mismatches = 0
    for (const clue of metadata) {
      const expected = clue.direction === 'across' ? byAcross.get(clue.number) ?? '' : byDown.get(clue.number) ?? ''
      const observed = extractWord(grid, best.state, clue.row, clue.col, clue.direction)
      if (!expected || !observed) continue
      if (expected !== observed) mismatches++
    }

    console.log(`  Mismatches on filled clues=${mismatches}`)
  }

  await db.destroy()
}

main().catch(async (error) => {
  console.error('check-answer-drift-by-title failed:', error)
  await db.destroy()
  process.exit(1)
})
