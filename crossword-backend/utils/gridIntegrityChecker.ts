import type { CellType, Direction } from './answerChecker'
import { extractClueMetadata, rot13 } from './answerChecker'

export interface GridIntegrityError {
  number: number
  direction: Direction
  errorType: 'blocked_cell' | 'length_mismatch' | 'missing_clue'
  expectedLength: number
  actualLength: number
  message: string
  cells: { r: number; c: number }[]
}

export interface GridIntegrityResult {
  isValid: boolean
  errors: GridIntegrityError[]
  totalClues: number
  validClues: number
}

export function checkGridIntegrity(
  grid: CellType[][],
  answers: { across: { number: number; answer: string }[]; down: { number: number; answer: string }[] }
): GridIntegrityResult {
  const errors: GridIntegrityError[] = []
  const metadata = extractClueMetadata(grid)

  if (!grid || grid.length === 0) {
    return {
      isValid: false,
      errors: [{ number: 0, direction: 'across', errorType: 'blocked_cell', expectedLength: 0, actualLength: 0, message: 'Grid is empty', cells: [] }],
      totalClues: 0,
      validClues: 0,
    }
  }

  for (const clue of metadata) {
    const cells: { r: number; c: number }[] = []
    let r = clue.row
    let c = clue.col

    while (r < grid.length && c < grid[0].length && grid[r][c] !== 'B') {
      cells.push({ r, c })
      if (clue.direction === 'across') c++
      else r++
    }

    const actualLength = cells.length

    const answerList = answers[clue.direction]
    const answerEntry = answerList?.find((a) => a.number === clue.number)

    if (!answerEntry) {
      errors.push({
        number: clue.number,
        direction: clue.direction,
        errorType: 'missing_clue',
        expectedLength: 0,
        actualLength,
        message: `Clue ${clue.number} ${clue.direction} not found in answers`,
        cells,
      })
      continue
    }

    const decrypted = rot13(answerEntry.answer).toUpperCase()
    // Remove spaces and hyphens from answers since grid cells only contain letters
    const expectedLength = decrypted.replace(/[\s-]/g, '').length

    if (actualLength === 0) {
      errors.push({
        number: clue.number,
        direction: clue.direction,
        errorType: 'blocked_cell',
        expectedLength,
        actualLength: 0,
        message: `Clue ${clue.number} ${clue.direction}: Answer starts at a blocked cell`,
        cells,
      })
      continue
    }

    const hasBlockedCell = cells.some((cell) => grid[cell.r][cell.c] === 'B')
    if (hasBlockedCell) {
      errors.push({
        number: clue.number,
        direction: clue.direction,
        errorType: 'blocked_cell',
        expectedLength,
        actualLength,
        message: `Clue ${clue.number} ${clue.direction}: Contains blocked cells in answer path (${actualLength} cells but expected ${expectedLength})`,
        cells,
      })
      continue
    }

    if (actualLength !== expectedLength) {
      errors.push({
        number: clue.number,
        direction: clue.direction,
        errorType: 'length_mismatch',
        expectedLength,
        actualLength,
        message: `Clue ${clue.number} ${clue.direction}: Grid has ${actualLength} cells but answer "${decrypted}" has ${expectedLength} letters`,
        cells,
      })
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    totalClues: metadata.length,
    validClues: metadata.length - errors.filter((e) => e.errorType !== 'missing_clue').length,
  }
}

export function parseGridString(gridString: string): CellType[][] {
  return gridString.split('\n').map((row) => row.trim().split(' ') as CellType[])
}
