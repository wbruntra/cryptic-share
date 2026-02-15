import { describe, expect, it } from 'bun:test'
import { parseGridString } from '../utils/gridIntegrityChecker'
import { constructGridFromAnswerKey } from '../utils/gridConstructor'

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

const ANSWERS = {
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

describe('gridConstructor', () => {
  it('reconstructs a known 15x15 grid from numbered across/down answers', () => {
    const expected = parseGridString(VALID_PUZZLE_GRID)

    const result = constructGridFromAnswerKey(
      {
        width: 15,
        height: 15,
        across: ANSWERS.across,
        down: ANSWERS.down,
      },
      { maxStates: 1_200_000 },
    )

    expect(result.success).toBe(true)
    expect(result.grid).toEqual(expected)
  })

  it('returns a clean failure when constraints cannot be satisfied', () => {
    const badAcross = [{ number: 1, answer: 'ABCDEFGHIJKLMNO' }]
    const badDown = [{ number: 1, answer: 'Z' }]

    const result = constructGridFromAnswerKey(
      {
        width: 5,
        height: 5,
        across: badAcross,
        down: badDown,
      },
      { maxStates: 20_000 },
    )

    expect(result.success).toBe(false)
    expect(result.message).toBeDefined()
  })
})
