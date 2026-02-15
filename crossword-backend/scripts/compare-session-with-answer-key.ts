import db from '../db-knex'
import { extractClueMetadata, rot13, type CellType, type Direction } from '../utils/answerChecker'
import { parseGridString } from '../utils/gridIntegrityChecker'

type AnswerEntry = { number: number; answer: string }

function normalize(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, '')
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

  return out
}

async function main() {
  const sessionId = process.argv[2]
  if (!sessionId) {
    console.error('Usage: bun run scripts/compare-session-with-answer-key.ts <sessionId>')
    process.exit(1)
  }

  const session = await db('puzzle_sessions').where({ session_id: sessionId }).first()
  if (!session) {
    console.error(`Session not found: ${sessionId}`)
    await db.destroy()
    process.exit(1)
  }

  const puzzle = await db('puzzles')
    .where({ id: session.puzzle_id })
    .first('id', 'title', 'grid', 'answers_encrypted')

  if (!puzzle || !puzzle.answers_encrypted) {
    console.error(`Puzzle or answers not found for puzzle_id=${session.puzzle_id}`)
    await db.destroy()
    process.exit(1)
  }

  let state: unknown
  try {
    state = JSON.parse(session.state)
  } catch (error) {
    console.error('Failed to parse session state JSON', error)
    await db.destroy()
    process.exit(1)
  }

  if (!Array.isArray(state) || !state.every((x) => typeof x === 'string')) {
    console.error('Session state is not string[] format')
    await db.destroy()
    process.exit(1)
  }

  const grid = parseGridString(puzzle.grid)
  const metadata = extractClueMetadata(grid)

  const encryptedAnswers = JSON.parse(puzzle.answers_encrypted)
  const byAcross = new Map<number, string>(
    ((encryptedAnswers.across ?? []) as AnswerEntry[]).map((a) => [a.number, normalize(rot13(a.answer))]),
  )
  const byDown = new Map<number, string>(
    ((encryptedAnswers.down ?? []) as AnswerEntry[]).map((a) => [a.number, normalize(rot13(a.answer))]),
  )

  console.log(`Session: ${sessionId}`)
  console.log(`Puzzle: ${puzzle.id} (${puzzle.title})`)

  let mismatchCount = 0
  let comparedCount = 0

  for (const clue of metadata) {
    const expected = clue.direction === 'across' ? byAcross.get(clue.number) ?? '' : byDown.get(clue.number) ?? ''
    const observed = normalize(extractWord(grid, state, clue.row, clue.col, clue.direction))

    if (!expected) continue
    if (!observed) continue

    comparedCount++

    if (observed !== expected) {
      mismatchCount++
      console.log(
        `MISMATCH ${clue.number} ${clue.direction}: expected=${expected} observed=${observed}`,
      )
    }
  }

  console.log(`Compared clues with filled letters: ${comparedCount}`)
  console.log(`Mismatches: ${mismatchCount}`)

  await db.destroy()
}

main().catch(async (error) => {
  console.error('compare-session-with-answer-key failed:', error)
  await db.destroy()
  process.exit(1)
})
