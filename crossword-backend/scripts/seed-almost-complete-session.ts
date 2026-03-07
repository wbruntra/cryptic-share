/**
 * Creates a test session for a puzzle with all answers filled in except the
 * last letter of one clue, so you can test the puzzle-complete confetti by
 * entering that single remaining letter.
 *
 * Usage:
 *   bun scripts/seed-almost-complete-session.ts
 *   bun scripts/seed-almost-complete-session.ts --puzzle-id 3
 *
 * Prints the session URL to open in the browser.
 */

import db from '../db-knex'
import { PuzzleService } from '../services/puzzleService'
import { SessionService } from '../services/sessionService'
import { getCorrectAnswersStructure, extractClueMetadata, rot13 } from '../utils/answerChecker'
import type { CellType } from '../utils/answerChecker'
import { createEmptyState, setCharAt } from '../utils/stateHelpers'

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173'

async function main() {
  // Parse --puzzle-id argument
  const args = process.argv.slice(2)
  const puzzleIdIdx = args.indexOf('--puzzle-id')
  let puzzleId: number | null = puzzleIdIdx !== -1 ? parseInt(args[puzzleIdIdx + 1], 10) : null

  if (puzzleId === null) {
    // Use the first puzzle in the database
    const first = await db('puzzles').select('id', 'title').orderBy('id', 'asc').first()
    if (!first) {
      console.error('No puzzles found in the database.')
      process.exit(1)
    }
    puzzleId = first.id
    console.log(`No --puzzle-id given, using first puzzle: [${puzzleId}] "${first.title}"`)
  }

  // Load puzzle and correct answers
  const puzzle = await PuzzleService.getPuzzleById(puzzleId)
  if (!puzzle) {
    console.error(`Puzzle ${puzzleId} not found.`)
    process.exit(1)
  }
  console.log(`Puzzle: [${puzzle.id}] "${puzzle.title}"`)

  const { puzzleAnswers } = await getCorrectAnswersStructure(puzzleId)
  if (!puzzleAnswers) {
    console.error('No answers found for this puzzle.')
    process.exit(1)
  }

  // Parse grid
  const grid: CellType[][] = puzzle.grid
    .split('\n')
    .map((row: string) => row.trim().split(' ') as CellType[])

  const height = grid.length
  const width = grid[0]?.length ?? 0
  if (height === 0 || width === 0) {
    console.error('Grid is empty or malformed.')
    process.exit(1)
  }

  // Build lookup: clue number + direction → decrypted answer
  const answerMap = new Map<string, string>()
  for (const dir of ['across', 'down'] as const) {
    const list = Array.isArray(puzzleAnswers[dir]) ? puzzleAnswers[dir] : []
    for (const entry of list) {
      const decrypted = rot13(entry.answer).toUpperCase().replace(/[^A-Z]/g, '')
      answerMap.set(`${entry.number}-${dir}`, decrypted)
    }
  }

  // Build fully-correct state
  const state = createEmptyState(height, width)
  const clues = extractClueMetadata(grid)

  for (const clue of clues) {
    const answer = answerMap.get(`${clue.number}-${clue.direction}`)
    if (!answer) continue

    let r = clue.row
    let c = clue.col
    for (let i = 0; i < answer.length; i++) {
      if (r >= height || c >= width || grid[r][c] === 'B') break
      state[r] = setCharAt(state[r], c, answer[i])
      if (clue.direction === 'across') c++
      else r++
    }
  }

  // Find the last across clue and leave its last letter blank
  const acrossClues = clues.filter((cl) => cl.direction === 'across')
  const lastAcross = acrossClues[acrossClues.length - 1]
  if (!lastAcross) {
    console.error('No across clues found.')
    process.exit(1)
  }

  const lastAnswer = answerMap.get(`${lastAcross.number}-across`) ?? ''
  // Walk to the last cell of that clue
  let r = lastAcross.row
  let c = lastAcross.col
  for (let i = 0; i < lastAnswer.length - 1; i++) {
    if (r >= height || c >= width || grid[r][c] === 'B') break
    c++
  }
  // Blank the last letter
  state[r] = setCharAt(state[r], c, ' ')

  console.log(
    `Leaving blank: ${lastAcross.number}-Across "${lastAnswer}" — last letter at (${r},${c})`,
  )

  // Create a fresh anonymous session with this state
  const sessionId = await SessionService.createOrResetSession(null, puzzleId)
  await db('puzzle_sessions')
    .where({ session_id: sessionId })
    .update({ state: JSON.stringify(state) })

  console.log(`\nSession created: ${sessionId}`)
  console.log(`\nOpen in browser:\n  ${FRONTEND_URL}/play/${sessionId}\n`)
  console.log(
    `Enter the last letter of ${lastAcross.number}-Across ("${lastAnswer}") to trigger completion.`,
  )

  process.exit(0)
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
