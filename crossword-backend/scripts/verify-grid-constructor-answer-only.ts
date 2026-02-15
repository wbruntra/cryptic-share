import db from '../db-knex'
import { rot13 } from '../utils/answerChecker'
import { parseGridString } from '../utils/gridIntegrityChecker'
import { constructGridFromAnswerKey } from '../utils/gridConstructor'

type AnswerEntry = { number: number; answer: string }

function decrypt(entries: AnswerEntry[] | undefined): AnswerEntry[] {
  if (!entries) return []
  return entries.map((entry) => ({ number: entry.number, answer: rot13(entry.answer) }))
}

async function main() {
  const puzzles = await db('puzzles')
    .select('id', 'title', 'grid', 'answers_encrypted')
    .whereNotNull('answers_encrypted')
    .orderBy('id', 'asc')

  let solved = 0
  let failed = 0

  console.log('Running strict answer-key-only verification (no templates, no session state)...')

  for (const puzzle of puzzles) {
    const expectedGrid = parseGridString(puzzle.grid)
    const height = expectedGrid.length
    const width = expectedGrid[0]?.length ?? 0

    const encrypted = JSON.parse(puzzle.answers_encrypted)
    const across = decrypt(encrypted.across)
    const down = decrypt(encrypted.down)

    const result = constructGridFromAnswerKey(
      { width, height, across, down },
      { maxStates: 2_000_000, maxMillis: 12_000 },
    )

    const isExactMatch = result.success && JSON.stringify(result.grid) === JSON.stringify(expectedGrid)

    if (isExactMatch) {
      solved++
      console.log(
        `✅ id=${puzzle.id}, title=${puzzle.title} exact match [states=${result.exploredStates}]`,
      )
    } else {
      failed++
      console.log(
        `❌ id=${puzzle.id}, title=${puzzle.title} ${result.message ?? 'mismatch'} [states=${result.exploredStates}]`,
      )
    }
  }

  console.log('\nSummary')
  console.log('-------')
  console.log(`Solved: ${solved}`)
  console.log(`Failed: ${failed}`)
  console.log(`Total: ${puzzles.length}`)

  await db.destroy()
}

main().catch(async (error) => {
  console.error('Answer-only verification failed:', error)
  await db.destroy()
  process.exit(1)
})
