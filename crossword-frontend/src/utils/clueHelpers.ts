import type { CellType, Direction } from '../types'

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

        // Check Across: valid if there is a letter to the right AND NO letter to the left
        // This ensures mid-word numbers don't trigger a new Across clue
        if (isLetter(r, c + 1) && !isLetter(r, c - 1)) {
          clues.push({ number: num, direction: 'across', row: r, col: c })
        }

        // Check Down: valid if there is a letter below AND NO letter above
        // This ensures mid-word numbers don't trigger a new Down clue
        if (isLetter(r + 1, c) && !isLetter(r - 1, c)) {
          clues.push({ number: num, direction: 'down', row: r, col: c })
        }

        currentNumber++
      }
    }
  }

  return clues
}

export function validateClues(grid: CellType[][], cluesJson: string): string[] {
  const errors: string[] = []

  // 1. Parse JSON
  let cluesData: any
  try {
    cluesData = JSON.parse(cluesJson)
  } catch (e) {
    return ['Invalid JSON format']
  }

  if (!cluesData || typeof cluesData !== 'object') {
    return ['JSON must be an object with "across" and "down" arrays']
  }

  // 2. Extract expected clues from grid
  const expectedClues = extractClueMetadata(grid)

  // 3. Build sets of existing clue numbers from JSON
  const existingAcross = new Set<number>()
  const existingDown = new Set<number>()

  if (Array.isArray(cluesData.across)) {
    cluesData.across.forEach((c: any) => {
      if (typeof c.number === 'number') existingAcross.add(c.number)
    })
  } else {
    errors.push('Missing "across" array in JSON')
  }

  if (Array.isArray(cluesData.down)) {
    cluesData.down.forEach((c: any) => {
      if (typeof c.number === 'number') existingDown.add(c.number)
    })
  } else {
    errors.push('Missing "down" array in JSON')
  }

  // 4. Validate Grid -> JSON (Missing clues)
  expectedClues.forEach((expected) => {
    if (expected.direction === 'across') {
      if (!existingAcross.has(expected.number)) {
        errors.push(`Missing Across clue for number ${expected.number}`)
      }
    } else {
      if (!existingDown.has(expected.number)) {
        errors.push(`Missing Down clue for number ${expected.number}`)
      }
    }
  })

  // 5. Validate JSON -> Grid (Extra clues)
  const expectedAcross = new Set(
    expectedClues.filter((c) => c.direction === 'across').map((c) => c.number),
  )
  const expectedDown = new Set(
    expectedClues.filter((c) => c.direction === 'down').map((c) => c.number),
  )

  existingAcross.forEach((num) => {
    if (!expectedAcross.has(num)) {
      errors.push(`Extra Across clue for number ${num} (not in grid)`)
    }
  })

  existingDown.forEach((num) => {
    if (!expectedDown.has(num)) {
      errors.push(`Extra Down clue for number ${num} (not in grid)`)
    }
  })

  return errors
}
