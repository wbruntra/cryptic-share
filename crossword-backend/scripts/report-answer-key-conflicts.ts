import db from '../db-knex'
import { extractClueMetadata, rot13, type CellType, type Direction } from '../utils/answerChecker'
import { parseGridString } from '../utils/gridIntegrityChecker'

type ClueItem = { number: number; clue: string }
type AnswerItem = { number: number; answer: string }

type CluePos = {
  number: number
  direction: Direction
  row: number
  col: number
  length: number
}

function normalize(answer: string): string {
  return rot13(answer).toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function getCluePositions(grid: CellType[][]): CluePos[] {
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
  const puzzleId = Number(process.argv[2])
  if (!Number.isFinite(puzzleId)) {
    console.error('Usage: bun run scripts/report-answer-key-conflicts.ts <puzzleId>')
    process.exit(1)
  }

  const puzzle = await db('puzzles')
    .select('id', 'title', 'grid', 'clues', 'answers_encrypted')
    .where({ id: puzzleId })
    .first()

  if (!puzzle || !puzzle.answers_encrypted) {
    console.error(`Puzzle ${puzzleId} not found or missing answers_encrypted`)
    await db.destroy()
    process.exit(1)
  }

  const grid = parseGridString(puzzle.grid)
  const positions = getCluePositions(grid)

  const clues = JSON.parse(puzzle.clues) as { across: ClueItem[]; down: ClueItem[] }
  const answers = JSON.parse(puzzle.answers_encrypted) as { across: AnswerItem[]; down: AnswerItem[] }

  const clueAcross = new Map<number, string>((clues.across ?? []).map((c) => [c.number, c.clue]))
  const clueDown = new Map<number, string>((clues.down ?? []).map((c) => [c.number, c.clue]))

  const answerAcross = new Map<number, string>(
    (answers.across ?? []).map((a) => [a.number, normalize(a.answer)]),
  )
  const answerDown = new Map<number, string>((answers.down ?? []).map((a) => [a.number, normalize(a.answer)]))

  console.log(`Puzzle id=${puzzle.id}, title=${puzzle.title}`)

  const acrossByCell = new Map<string, { number: number; idx: number; letter: string }>()

  for (const pos of positions.filter((p) => p.direction === 'across')) {
    const ans = answerAcross.get(pos.number) ?? ''
    for (let i = 0; i < Math.min(ans.length, pos.length); i++) {
      acrossByCell.set(`${pos.row},${pos.col + i}`, {
        number: pos.number,
        idx: i,
        letter: ans[i]!,
      })
    }
  }

  let conflictCount = 0

  for (const pos of positions.filter((p) => p.direction === 'down')) {
    const downAns = answerDown.get(pos.number) ?? ''
    for (let i = 0; i < Math.min(downAns.length, pos.length); i++) {
      const key = `${pos.row + i},${pos.col}`
      const acrossHit = acrossByCell.get(key)
      if (!acrossHit) continue

      const downLetter = downAns[i]!
      if (acrossHit.letter !== downLetter) {
        conflictCount++
        const [row, col] = key.split(',').map(Number)

        const acrossClue = clueAcross.get(acrossHit.number) ?? '(clue missing)'
        const downClue = clueDown.get(pos.number) ?? '(clue missing)'
        const acrossAnswer = answerAcross.get(acrossHit.number) ?? ''

        console.log('\nCONFLICT #' + conflictCount)
        console.log(`  cell=(${row},${col})`)
        console.log(
          `  across ${acrossHit.number}: letter='${acrossHit.letter}' at index ${acrossHit.idx + 1}/${acrossAnswer.length}`,
        )
        console.log(`    clue: ${acrossClue}`)
        console.log(`    answer: ${acrossAnswer}`)
        console.log(`  down ${pos.number}: letter='${downLetter}' at index ${i + 1}/${downAns.length}`)
        console.log(`    clue: ${downClue}`)
        console.log(`    answer: ${downAns}`)
      }
    }
  }

  if (conflictCount === 0) {
    console.log('No across/down letter conflicts found.')
  } else {
    console.log(`\nTotal conflicts: ${conflictCount}`)
  }

  await db.destroy()
}

main().catch(async (error) => {
  console.error('report-answer-key-conflicts failed:', error)
  await db.destroy()
  process.exit(1)
})
