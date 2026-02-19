import { PuzzleService } from '../services/puzzleService'
import { setCharAt, getCharAt } from './stateHelpers'

export type CellType = 'N' | 'W' | 'B'
export type Direction = 'across' | 'down'

export interface ClueMetadata {
  number: number
  direction: Direction
  row: number
  col: number
}

export function extractClueMetadata(grid: CellType[][]): ClueMetadata[] {
  const clues: ClueMetadata[] = []

  if (!grid || grid.length === 0) return clues

  const height = grid.length
  const width = grid[0].length

  // Helper to check if a cell contains a letter (White or Numbered)
  const isLetter = (r: number, c: number) => {
    if (r < 0 || r >= height || c < 0 || c >= width) return false
    return grid[r][c] !== 'B'
  }

  let currentNumber = 1

  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      if (grid[r][c] === 'N') {
        const num = currentNumber

        // Check Across
        if (isLetter(r, c + 1) && !isLetter(r, c - 1)) {
          clues.push({ number: num, direction: 'across', row: r, col: c })
        }

        // Check Down
        if (isLetter(r + 1, c) && !isLetter(r - 1, c)) {
          clues.push({ number: num, direction: 'down', row: r, col: c })
        }

        currentNumber++
      }
    }
  }

  return clues
}

export function rot13(str: string): string {
  return str.replace(/[a-zA-Z]/g, (c) => {
    const base = c <= 'Z' ? 65 : 97
    return String.fromCharCode(base + ((c.charCodeAt(0) - base + 13) % 26))
  })
}

function extractWord(
  grid: CellType[][],
  sessionState: string[],
  startRow: number,
  startCol: number,
  direction: Direction,
): string {
  let word = ''
  let r = startRow
  let c = startCol

  while (r < grid.length && c < grid[0].length && grid[r][c] !== 'B') {
    const char = getCharAt(sessionState, r, c) || ' '
    word += char

    if (direction === 'across') {
      c++
    } else {
      r++
    }
  }

  return word.trim()
}

export interface CheckResult {
  number: number
  direction: Direction
  userAnswer: string
  correctAnswer: string
  isCorrect: boolean
  cells: { r: number; c: number }[]
}

export async function getCorrectAnswersStructure(puzzleId: number) {
  const puzzle = await PuzzleService.getPuzzleById(puzzleId)
  if (!puzzle) throw new Error(`Puzzle ${puzzleId} not found`)

  let correctAnswers: any = {}
  if (puzzle.answers) {
    // If API already returns answers (decrypted by service or stored as JSON), use them.
    correctAnswers = puzzle.answers
  } else if (puzzle.answers_encrypted) {
    // Fallback if not processed
    correctAnswers = JSON.parse(puzzle.answers_encrypted)
  }

  let puzzleAnswers = correctAnswers
  if (correctAnswers.puzzles && Array.isArray(correctAnswers.puzzles)) {
    puzzleAnswers = correctAnswers.puzzles[0]
  }

  return { puzzle, puzzleAnswers }
}

export interface CachedPuzzleData {
  grid: CellType[][]
  metadata: ClueMetadata[]
  totalLetters: number
  rawGrid: string
}

const puzzleCache = new Map<number, CachedPuzzleData>()
const MAX_CACHE_SIZE = 100

export function getCachedPuzzleData(puzzleId: number, rawGrid: string): CachedPuzzleData {
  let cached = puzzleCache.get(puzzleId)

  // Invalidate if grid changed
  if (!cached || cached.rawGrid !== rawGrid) {
    const grid: CellType[][] = rawGrid
      .split('\n')
      .map((row: string) => row.trim().split(' ') as CellType[])
    const metadata = extractClueMetadata(grid)

    let totalLetters = 0
    for (let r = 0; r < grid.length; r++) {
      for (let c = 0; c < grid[0].length; c++) {
        if (grid[r][c] !== 'B') {
          totalLetters++
        }
      }
    }

    cached = { grid, metadata, totalLetters, rawGrid }

    if (puzzleCache.size >= MAX_CACHE_SIZE) {
      const firstKey = puzzleCache.keys().next().value
      if (firstKey !== undefined) puzzleCache.delete(firstKey)
    }

    puzzleCache.set(puzzleId, cached)
  } else {
    // Move to end (most recently used)
    puzzleCache.delete(puzzleId)
    puzzleCache.set(puzzleId, cached)
  }
  return cached
}

export async function checkSessionAnswers(
  puzzleId: number,
  sessionState: string[],
): Promise<{
  results: CheckResult[]
  totalClues: number
  totalLetters: number
  filledLetters: number
}> {
  const { puzzle, puzzleAnswers } = await getCorrectAnswersStructure(puzzleId)

  const { grid, metadata, totalLetters } = getCachedPuzzleData(puzzleId, puzzle.grid)

  const results: CheckResult[] = []

  for (const item of metadata) {
    // Determine cell positions for this word
    const cells: { r: number; c: number }[] = []
    let r = item.row
    let c = item.col
    while (r < grid.length && c < grid[0].length && grid[r][c] !== 'B') {
      cells.push({ r, c })
      if (item.direction === 'across') c++
      else r++
    }

    const userAnswer = extractWord(grid, sessionState, item.row, item.col, item.direction)

    // Skip if incomplete (contains spaces)
    if (userAnswer.includes(' ') || userAnswer.length !== cells.length) {
      continue
    }

    // Find correct answer
    const list = puzzleAnswers[item.direction] // e.g. puzzleAnswers.across
    const answerEntry = list?.find((a: any) => a.number === item.number)

    if (answerEntry) {
      // Decrypt ROT13
      const decrypted = rot13(answerEntry.answer).toUpperCase()
      const userClean = userAnswer.toUpperCase()

      // Normalize for comparison
      const normalize = (s: string) => s.replace(/[^A-Z0-9]/g, '')

      const isCorrect = normalize(userClean) === normalize(decrypted)

      results.push({
        number: item.number,
        direction: item.direction,
        userAnswer: userAnswer,
        correctAnswer: decrypted,
        isCorrect,
        cells,
      })
    }
  }

  // Count filled letters in sessionState (totalLetters is cached)
  let filledLetters = 0

  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[0].length; c++) {
      if (grid[r][c] !== 'B') {
        const char = getCharAt(sessionState, r, c)
        if (char && char.trim() !== '') {
          filledLetters++
        }
      }
    }
  }

  return { results, totalClues: metadata.length, totalLetters, filledLetters }
}
