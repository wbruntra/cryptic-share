import type { CellType, Direction, PuzzleAnswers } from '../types'

export interface ClueMetadata {
  number: number
  direction: Direction
  row: number
  col: number
}

export interface CheckResult {
  number: number
  direction: Direction
  userAnswer: string
  correctAnswer: string
  isCorrect: boolean
  cells: { r: number; c: number }[]
}

/**
 * ROT13 decryption - same algorithm used in backend
 */
export function rot13(str: string): string {
  return str.replace(/[a-zA-Z]/g, (c) => {
    const base = c <= 'Z' ? 65 : 97
    return String.fromCharCode(base + ((c.charCodeAt(0) - base + 13) % 26))
  })
}

/**
 * Extract metadata for all clues in the grid
 */
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

/**
 * Get character at position from session state
 */
function getCharAt(sessionState: string[], r: number, c: number): string {
  if (!sessionState[r]) return ' '
  return sessionState[r][c] || ' '
}

/**
 * Extract a word from the grid based on starting position and direction
 */
function extractWord(
  grid: CellType[][],
  sessionState: string[],
  startRow: number,
  startCol: number,
  direction: Direction
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

/**
 * Check a single word given its clue number and direction
 * Returns null if the word is incomplete or not found
 */
export function checkSingleWord(
  grid: CellType[][],
  sessionState: string[],
  puzzleAnswers: PuzzleAnswers,
  clueNumber: number,
  direction: Direction
): CheckResult | null {
  // Find the starting position for this clue
  const metadata = extractClueMetadata(grid)
  const clueMeta = metadata.find((m) => m.number === clueNumber && m.direction === direction)

  if (!clueMeta) {
    return null
  }

  // Extract the user's answer for this word
  const userAnswer = extractWord(grid, sessionState, clueMeta.row, clueMeta.col, direction)

  // Determine all cell positions for this word
  const cells: { r: number; c: number }[] = []
  let r = clueMeta.row
  let c = clueMeta.col
  while (r < grid.length && c < grid[0].length && grid[r][c] !== 'B') {
    cells.push({ r, c })
    if (direction === 'across') c++
    else r++
  }

  // Skip if incomplete (contains spaces or doesn't match expected length)
  if (userAnswer.includes(' ') || userAnswer.length !== cells.length) {
    return null
  }

  // Find correct answer
  const list = puzzleAnswers[direction]
  const answerEntry = list?.find((a) => a.number === clueNumber)

  if (!answerEntry) {
    return null
  }

  // Decrypt ROT13 and compare
  const decrypted = rot13(answerEntry.answer).toUpperCase()
  const userClean = userAnswer.toUpperCase()

  // Normalize for comparison
  const normalize = (s: string) => s.replace(/[^A-Z0-9]/g, '')
  const isCorrect = normalize(userClean) === normalize(decrypted)

  return {
    number: clueNumber,
    direction,
    userAnswer: userClean,
    correctAnswer: decrypted,
    isCorrect,
    cells,
  }
}

/**
 * Check session answers against correct answers - performs all checking client-side
 */
export function checkSessionAnswers(
  grid: CellType[][],
  sessionState: string[],
  puzzleAnswers: PuzzleAnswers
): {
  results: CheckResult[]
  totalClues: number
  totalLetters: number
  filledLetters: number
  errorCells: string[]
} {
  const metadata = extractClueMetadata(grid)
  const results: CheckResult[] = []
  const errorCells: string[] = []

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
    const list = puzzleAnswers[item.direction]
    const answerEntry = list?.find((a) => a.number === item.number)

    if (answerEntry) {
      // Decrypt ROT13
      const decrypted = rot13(answerEntry.answer).toUpperCase()
      const userClean = userAnswer.toUpperCase()

      // Normalize for comparison
      const normalize = (s: string) => s.replace(/[^A-Z0-9]/g, '')

      const isCorrect = normalize(userClean) === normalize(decrypted)

      if (!isCorrect) {
        // Add all cells of incorrect words to error cells
        cells.forEach((cell) => {
          errorCells.push(`${cell.r}-${cell.c}`)
        })
      }

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

  // Count total letters in grid and filled letters in sessionState
  let totalLetters = 0
  let filledLetters = 0

  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[0].length; c++) {
      if (grid[r][c] !== 'B') {
        totalLetters++
        const char = getCharAt(sessionState, r, c)
        if (char && char.trim() !== '') {
          filledLetters++
        }
      }
    }
  }

  return {
    results,
    totalClues: metadata.length,
    totalLetters,
    filledLetters,
    errorCells,
  }
}