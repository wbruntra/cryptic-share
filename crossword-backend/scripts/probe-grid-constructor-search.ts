import db from '../db-knex'
import { rot13 } from '../utils/answerChecker'
import { parseGridString } from '../utils/gridIntegrityChecker'
import { constructGridFromAnswerKey } from '../utils/gridConstructor'

async function main() {
  const puzzles = await db('puzzles')
    .select('id', 'title', 'grid', 'answers_encrypted')
    .whereIn('title', ['48', '56'])
    .whereNotNull('answers_encrypted')
    .orderBy('id', 'asc')

  for (const puzzle of puzzles) {
    const grid = parseGridString(puzzle.grid)
    const answers = JSON.parse(puzzle.answers_encrypted)

    const across = (answers.across ?? []).map((a: { number: number; answer: string }) => ({
      number: a.number,
      answer: rot13(a.answer),
    }))
    const down = (answers.down ?? []).map((a: { number: number; answer: string }) => ({
      number: a.number,
      answer: rot13(a.answer),
    }))

    const result = constructGridFromAnswerKey(
      {
        width: grid[0]!.length,
        height: grid.length,
        across,
        down,
      },
      {
        maxStates: 2_000_000,
        maxMillis: 12_000,
        includeDiagnosticsInMessage: true,
      },
    )

    console.log(`Puzzle ${puzzle.id} (${puzzle.title}) -> success=${result.success}`)
    console.log(`  exploredStates=${result.exploredStates}`)
    console.log(`  message=${result.message ?? ''}`)
  }

  await db.destroy()
}

main().catch(async (error) => {
  console.error('probe-grid-constructor-search failed:', error)
  await db.destroy()
  process.exit(1)
})
