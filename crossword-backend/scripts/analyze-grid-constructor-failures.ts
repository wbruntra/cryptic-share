import db from '../db-knex'
import { extractClueMetadata, rot13, type CellType } from '../utils/answerChecker'
import { parseGridString } from '../utils/gridIntegrityChecker'
import { getAnswerKeyLengthSignature, getGridLengthSignature } from '../utils/gridConstructor'

type AnswerEntry = { number: number; answer: string }

type CluePosition = {
  number: number
  direction: 'across' | 'down'
  row: number
  col: number
  length: number
}

function normalizeAnswer(answer: string): string {
  return rot13(answer).toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function extractCluePositions(grid: CellType[][]): CluePosition[] {
  const metadata = extractClueMetadata(grid)
  return metadata.map((m) => {
    let r = m.row
    let c = m.col
    let length = 0
    while (r < grid.length && c < grid[0]!.length && grid[r]![c] !== 'B') {
      length++
      if (m.direction === 'across') c++
      else r++
    }
    return { ...m, length }
  })
}

async function main() {
  const puzzles = await db('puzzles')
    .select('id', 'title', 'grid', 'answers_encrypted')
    .whereIn('title', ['48', '56'])
    .whereNotNull('answers_encrypted')
    .orderBy('id', 'asc')

  for (const puzzle of puzzles) {
    const grid = parseGridString(puzzle.grid)
    const positions = extractCluePositions(grid)

    const encrypted = JSON.parse(puzzle.answers_encrypted)
    const across = (encrypted.across ?? []) as AnswerEntry[]
    const down = (encrypted.down ?? []) as AnswerEntry[]

    const acrossMap = new Map<number, string>(across.map((a) => [a.number, normalizeAnswer(a.answer)]))
    const downMap = new Map<number, string>(down.map((d) => [d.number, normalizeAnswer(d.answer)]))

    let missingAnswers = 0
    let lengthMismatches = 0
    let crossingConflicts = 0
    const conflictDetails: Array<{
      row: number
      col: number
      acrossNumber: number
      acrossLetter: string
      downNumber: number
      downLetter: string
    }> = []

    const cellAcross = new Map<string, { number: number; index: number; letter: string }>()

    for (const pos of positions) {
      const ans = pos.direction === 'across' ? acrossMap.get(pos.number) : downMap.get(pos.number)
      if (!ans) {
        missingAnswers++
        continue
      }
      if (ans.length !== pos.length) {
        lengthMismatches++
      }

      if (pos.direction === 'across') {
        for (let i = 0; i < Math.min(ans.length, pos.length); i++) {
          const key = `${pos.row},${pos.col + i}`
          cellAcross.set(key, { number: pos.number, index: i, letter: ans[i]! })
        }
      }
    }

    for (const pos of positions.filter((p) => p.direction === 'down')) {
      const ans = downMap.get(pos.number)
      if (!ans) continue
      for (let i = 0; i < Math.min(ans.length, pos.length); i++) {
        const key = `${pos.row + i},${pos.col}`
        const acrossHit = cellAcross.get(key)
        if (acrossHit && acrossHit.letter !== ans[i]) {
          crossingConflicts++
          conflictDetails.push({
            row: pos.row + i,
            col: pos.col,
            acrossNumber: acrossHit.number,
            acrossLetter: acrossHit.letter,
            downNumber: pos.number,
            downLetter: ans[i]!,
          })
        }
      }
    }

    const answerSignature = getAnswerKeyLengthSignature({
      width: grid[0]!.length,
      height: grid.length,
      across: across.map((a) => ({ number: a.number, answer: normalizeAnswer(a.answer) })),
      down: down.map((d) => ({ number: d.number, answer: normalizeAnswer(d.answer) })),
    })
    const gridSignature = getGridLengthSignature(grid)

    console.log(`\nPuzzle ${puzzle.id} (${puzzle.title})`)
    console.log(`  signatureMatch: ${answerSignature === gridSignature}`)
    console.log(`  missingAnswers: ${missingAnswers}`)
    console.log(`  lengthMismatches: ${lengthMismatches}`)
    console.log(`  crossingConflicts(in stored grid): ${crossingConflicts}`)
    if (conflictDetails.length > 0) {
      for (const c of conflictDetails) {
        console.log(
          `    - cell(${c.row},${c.col}) across ${c.acrossNumber}='${c.acrossLetter}' vs down ${c.downNumber}='${c.downLetter}'`,
        )
      }
    }
  }

  await db.destroy()
}

main().catch(async (error) => {
  console.error('analyze-grid-constructor-failures failed:', error)
  await db.destroy()
  process.exit(1)
})
