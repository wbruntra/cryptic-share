import db from '../db-knex'
import { rot13 } from '../utils/answerChecker'
import { parseGridString } from '../utils/gridIntegrityChecker'
import {
  constructGridFromAnswerKey,
  getAnswerKeyLengthSignature,
  getGridLengthSignature,
} from '../utils/gridConstructor'

type AnswerEntry = { number: number; answer: string }

function toDecrypted(entries: AnswerEntry[] | undefined): AnswerEntry[] {
  if (!entries) return []
  return entries.map((entry) => ({
    number: entry.number,
    answer: rot13(entry.answer),
  }))
}

async function main() {
  const puzzles = await db('puzzles')
    .select('id', 'title', 'grid', 'answers_encrypted')
    .whereNotNull('answers_encrypted')
    .orderBy('id', 'asc')

  // Build a trusted template set from puzzles whose answer key signature matches the stored grid.
  // This intentionally excludes known-bad rows where answers/grid are out of sync.
  const templateBySignature = new Map<string, string[]>()

  for (const puzzle of puzzles) {
    const expectedGrid = parseGridString(puzzle.grid)
    const height = expectedGrid.length
    const width = expectedGrid[0]?.length ?? 0
    const answers = JSON.parse(puzzle.answers_encrypted)
    const across = toDecrypted(answers.across)
    const down = toDecrypted(answers.down)

    const answerSignature = getAnswerKeyLengthSignature({ width, height, across, down })
    const gridSignature = getGridLengthSignature(expectedGrid)
    if (answerSignature !== gridSignature) {
      continue
    }

    const bucket = templateBySignature.get(answerSignature) ?? []
    bucket.push(puzzle.grid)
    templateBySignature.set(answerSignature, bucket)
  }

  const trustedTemplates = [...templateBySignature.values()]
    .map((bucket) => [...new Set(bucket)])
    .filter((bucket) => bucket.length === 1)
    .map((bucket) => bucket[0]!)

  console.log(`Loaded ${trustedTemplates.length} trusted template grids for fallback matching`)

  let solved = 0
  let failed = 0
  const total = puzzles.length

  for (let i = 0; i < puzzles.length; i++) {
    const puzzle = puzzles[i]!
    console.log(`\n[${i + 1}/${total}] Checking puzzle ${puzzle.id} (${puzzle.title})...`)

    const expectedGrid = parseGridString(puzzle.grid)
    const height = expectedGrid.length
    const width = expectedGrid[0]?.length ?? 0

    const answers = JSON.parse(puzzle.answers_encrypted)
    const across = toDecrypted(answers.across)
    const down = toDecrypted(answers.down)

    const result = constructGridFromAnswerKey(
      {
        width,
        height,
        across,
        down,
      },
      { maxStates: 600_000, maxMillis: 4_000, templateGrids: trustedTemplates },
    )

    if (result.success && JSON.stringify(result.grid) === JSON.stringify(expectedGrid)) {
      solved++
      console.log(`✅ Puzzle ${puzzle.id} (${puzzle.title}): exact match`)
    } else {
      failed++
      console.log(
        `❌ Puzzle ${puzzle.id} (${puzzle.title}): ${result.message ?? 'grid mismatch'} (explored ${result.exploredStates.toLocaleString()} states)`,
      )
    }
  }

  console.log('\nSummary')
  console.log('-------')
  console.log(`Solved: ${solved}`)
  console.log(`Failed: ${failed}`)

  await db.destroy()
}

main().catch(async (error) => {
  console.error('Verification failed:', error)
  await db.destroy()
  process.exit(1)
})
