import { describe, it, expect } from 'bun:test'
import { checkGridIntegrity, parseGridString } from '../utils/gridIntegrityChecker'

// Valid puzzle (id=3) from database
const VALID_PUZZLE_GRID = `N W N W N W N B N W N W N W B
W B W B W B W B W B W B W B N
N W W W W W W B N W W W W W W
W B W B B B W B W B W B W B W
N W W B N W W W W W W W W W W
W B W B W B B B W B B B W B W
N W W W W B N W W W N W W W W
B B W B W B W B W B W B W B B
N W W W W W W W W B N W W W N
W B W B B B W B B B W B W B W
N W W W N W W W N W W B N W W
W B W B W B W B W B B B W B W
N W W W W W W B N W N W W W W
W B W B W B W B W B W B W B W
B N W W W W W B N W W W W W W`

const VALID_PUZZLE_ANSWERS = {
  across: [
    { number: 1, answer: 'Qhenoyr' },
    { number: 5, answer: 'Nyybjf' },
    { number: 9, answer: 'Jvpxrgf' },
    { number: 10, answer: 'Cerprqr' },
    { number: 11, answer: 'Trr' },
    { number: 12, answer: 'Wblyrffarff' },
    { number: 13, answer: 'Erfva' },
    { number: 14, answer: 'Chepunfre' },
    { number: 16, answer: 'Sevpnffrr' },
    { number: 17, answer: 'Hfure' },
    { number: 19, answer: 'Pbagergrzcf' },
    { number: 22, answer: 'VZS' },
    { number: 23, answer: 'Qevir-va' },
    { number: 24, answer: 'Yrvcmvt' },
    { number: 26, answer: 'Fgnapr' },
    { number: 27, answer: 'Erchyfr' },
  ],
  down: [
    { number: 1, answer: 'Qbjntre' },
    { number: 2, answer: 'Ebpxrg fpvragvfg' },
    { number: 3, answer: 'Orr' },
    { number: 4, answer: 'Rffnl' },
    { number: 5, answer: 'Nccyr gerr' },
    { number: 6, answer: 'Yrrxf' },
    { number: 7, answer: 'Jvrare fpuavgmry' },
    { number: 8, answer: 'Trlfre' },
    { number: 12, answer: 'Whagn' },
    { number: 14, answer: 'Cnfg grafr' },
    { number: 15, answer: 'Ubhef' },
    { number: 16, answer: 'Snpnqr' },
    { number: 18, answer: 'Ershttr' },
    { number: 20, answer: 'Eurva' },
    { number: 21, answer: 'Zbyne' },
    { number: 25, answer: 'Vzc' },
  ],
}

describe('gridIntegrityChecker', () => {
  describe('parseGridString', () => {
    it('should parse a valid grid string', () => {
      const gridString = 'N W B\nW N W\nB W N'
      const grid = parseGridString(gridString)
      expect(grid).toEqual([
        ['N', 'W', 'B'],
        ['W', 'N', 'W'],
        ['B', 'W', 'N'],
      ])
    })

    it('should handle grid with extra whitespace in rows', () => {
      const gridString = 'N W B\nW N W'
      const grid = parseGridString(gridString)
      expect(grid).toEqual([
        ['N', 'W', 'B'],
        ['W', 'N', 'W'],
      ])
    })
  })

  describe('checkGridIntegrity', () => {
    it('should validate a correct puzzle from database', () => {
      const grid = parseGridString(VALID_PUZZLE_GRID)
      const result = checkGridIntegrity(grid, VALID_PUZZLE_ANSWERS)
      expect(result.isValid).toBe(true)
      expect(result.errors).toHaveLength(0)
      expect(result.totalClues).toBe(32)
    })

    it('should detect length mismatches when answer is longer than grid space', () => {
      const grid = parseGridString(VALID_PUZZLE_GRID)
      
      const answers = {
        across: [
          { number: 1, answer: 'THISANSWERISWAYTOOLONGFORPUZZLE' },
        ],
        down: VALID_PUZZLE_ANSWERS.down,
      }

      const result = checkGridIntegrity(grid, answers)
      expect(result.isValid).toBe(false)
      const lengthError = result.errors.find(e => e.errorType === 'length_mismatch')
      expect(lengthError).toBeDefined()
    })

    it('should detect missing clues', () => {
      const grid = parseGridString(VALID_PUZZLE_GRID)
      const emptyAnswers = { across: [], down: [] }
      const result = checkGridIntegrity(grid, emptyAnswers)
      expect(result.isValid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(30)
      expect(result.errors.every(e => e.errorType === 'missing_clue')).toBe(true)
    })

    it('should handle empty grid', () => {
      const grid: string[][] = []
      const answers = { across: [], down: [] }
      const result = checkGridIntegrity(grid as any, answers)
      expect(result.isValid).toBe(false)
      expect(result.errors[0].message).toBe('Grid is empty')
    })

    it('should work with a correctly configured small grid', () => {
      const gridString = 'N W B\nW N W\nB W N'
      const grid = parseGridString(gridString)
      
      const answers = {
        across: [
          { number: 1, answer: 'NO' },
        ],
        down: [
          { number: 1, answer: 'NW' },
        ],
      }

      const result = checkGridIntegrity(grid, answers)
      expect(result.isValid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })
  })
})
