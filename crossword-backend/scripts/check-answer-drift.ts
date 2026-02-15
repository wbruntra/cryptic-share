import db from '../db-knex'
import { extractClueMetadata, rot13, type Direction } from '../utils/answerChecker'
import { parseGridString } from '../utils/gridIntegrityChecker'

type SessionRow = {
  session_id: string
  state: string
  updated_at?: string
}

type PuzzleRow = {
  id: number
  title: string
  grid: string
  answers_encrypted: string
}

function normalize(text: string): string {
  return text.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function getChar(state: string[], r: number, c: number): string {
  const row = state[r] ?? ''
  const ch = row[c] ?? ''
  return ch === ' ' ? '' : ch.toUpperCase()
}

function extractWord(grid: string[][], state: string[], row: number, col: number, direction: Direction): string {
  let r = row
  let c = col
  let word = ''

  while (r < grid.length && c < grid[0]!.length && grid[r]![c] !== 'B') {
    word += getChar(state, r, c)
    if (direction === 'across') c++
    else r++
  }

  return normalize(word)
}

function filledCount(grid: string[][], state: string[]): number {
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
  const puzzles = (await db('puzzles')
    .select('id', 'title', 'grid', 'answers_encrypted')
    .whereIn('title', ['21', '22', '23', '24'])
    .whereNotNull('answers_encrypted')
    .orderBy('id', 'asc')) as PuzzleRow[]

  if (puzzles.length === 0) {
    console.log('No puzzles found for titles 21-24')
    await db.destroy()
    return
  }

  for (const puzzle of puzzles) {
    const grid = parseGridString(puzzle.grid)
    const metadata = extractClueMetadata(grid)
    const totalLetters = grid.flat().filter((x) => x !== 'B').length

    const sessions = (await db('puzzle_sessions')
      .select('session_id', 'state', 'updated_at')
      .where({ puzzle_id: puzzle.id })
      .orderBy('updated_at', 'desc')) as SessionRow[]

    let best: { sessionId: string; state: string[]; filled: number } | null = null

    for (const session of sessions) {
      let state: unknown
      try {
        state = JSON.parse(session.state)
      } catch {
        continue
      }

      if (!Array.isArray(state) || !state.every((x) => typeof x === 'string')) {
        continue
      }

      const filled = filledCount(grid, state)
      if (!best || filled > best.filled) {
        best = { sessionId: session.session_id, state, filled }
      }
    }

    console.log(`\nPuzzle ${puzzle.id} (${puzzle.title})`)
    if (!best) {
      console.log('  No parseable sessions found')
      continue
    }

    console.log(`  Best session: ${best.sessionId}`)
    console.log(`  Filled cells: ${best.filled}/${totalLetters}`)

    const encryptedAnswers = JSON.parse(puzzle.answers_encrypted)
    const expectedAcross = new Map<number, string>(
      (encryptedAnswers.across ?? []).map((item: { number: number; answer: string }) => [
        item.number,
        normalize(rot13(item.answer)),
      ]),
    )
    const expectedDown = new Map<number, string>(
      (encryptedAnswers.down ?? []).map((item: { number: number; answer: string }) => [
        item.number,
        normalize(rot13(item.answer)),
      ]),
    )

    let mismatches = 0

    for (const clue of metadata) {
      const observed = extractWord(grid, best.state, clue.row, clue.col, clue.direction)
      const expected =
        clue.direction === 'across' ? expectedAcross.get(clue.number) ?? '' : expectedDown.get(clue.number) ?? ''

      if (observed && expected && observed !== expected) {
        mismatches++
        console.log(
          `  MISMATCH ${clue.number} ${clue.direction}: expected=${expected} observed=${observed}`,
        )
      }
    }

    if (mismatches === 0) {
      console.log('  ✅ No mismatches for all currently filled entries')
    }
  }

  await db.destroy()
}

main().catch(async (error) => {
  console.error('check-answer-drift failed:', error)
  await db.destroy()
  process.exit(1)
})
