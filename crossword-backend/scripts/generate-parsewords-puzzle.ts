/**
 * Generate a Parsewords puzzle definition from a clue explanation and optionally save it.
 *
 * Usage:
 *   bun scripts/generate-parsewords-puzzle.ts <puzzleId> <clueNumber> <direction> [--save] [--regen]
 *
 * Flags:
 *   --save   Write the generated puzzle to the parsewords_puzzles table (upsert)
 *   --regen  Re-generate the explanation fresh from the LLM (using the new step schema)
 *            rather than using the stored explanation_json from the DB.
 *            Use this for clues whose stored explanation pre-dates the step-by-step schema.
 *
 * Examples:
 *   bun scripts/generate-parsewords-puzzle.ts 3 5 across
 *   bun scripts/generate-parsewords-puzzle.ts 3 5 across --regen
 *   bun scripts/generate-parsewords-puzzle.ts 3 5 across --regen --save
 */

import OpenAI from 'openai'
import db from '../db-knex'
import { crypticInstructions } from '../utils/crypticSchema'
import { generateParsewordsPuzzle } from '../utils/parsewordsGenerator'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

async function regenerateExplanation(clueText: string, answer: string): Promise<unknown> {
  console.log('Re-generating explanation with new step schema...')
  const res = await openai.chat.completions.create({
    model: 'gpt-5-mini',
    messages: [
      { role: 'system', content: crypticInstructions },
      { role: 'user', content: `Clue: ${clueText}\nAnswer: ${answer}` },
    ],
    response_format: { type: 'json_object' },
  })
  return JSON.parse(res.choices[0]!.message.content!)
}

async function main() {
  const args = process.argv.slice(2)
  const save = args.includes('--save')
  const regen = args.includes('--regen')
  const positional = args.filter((a) => !a.startsWith('--'))

  const puzzleId = parseInt(positional[0] ?? '1', 10)
  const clueNumber = parseInt(positional[1] ?? '24', 10)
  const direction = (positional[2] ?? 'across').toLowerCase()

  console.log(`Fetching clue for puzzle ${puzzleId}, ${clueNumber} ${direction}...`)

  const row = await db('clue_explanations')
    .where({ puzzle_id: puzzleId, clue_number: clueNumber, direction })
    .first()

  if (!row) {
    console.error(`No explanation found for puzzle ${puzzleId}, ${clueNumber} ${direction}`)
    process.exit(1)
  }

  console.log(`Clue:   ${row.clue_text}`)
  console.log(`Answer: ${row.answer}`)
  console.log()

  const explanation = regen
    ? await regenerateExplanation(row.clue_text, row.answer)
    : JSON.parse(row.explanation_json)

  if (regen) {
    console.log('=== Fresh Explanation ===')
    console.log(JSON.stringify(explanation, null, 2))
    console.log()
  }

  console.log('Generating Parsewords puzzle via gpt-5-mini...')
  const puzzle = await generateParsewordsPuzzle(row.clue_text, row.answer, explanation)

  console.log('\n=== Generated Puzzle ===')
  console.log(JSON.stringify(puzzle, null, 2))

  if (save) {
    await db('parsewords_puzzles')
      .insert({
        puzzle_id: puzzleId,
        clue_number: clueNumber,
        direction,
        puzzle_json: JSON.stringify(puzzle),
        updated_at: new Date(),
      })
      .onConflict(['puzzle_id', 'clue_number', 'direction'])
      .merge(['puzzle_json', 'updated_at'])

    console.log('\nSaved to parsewords_puzzles.')
  } else {
    console.log('\n(Dry run — pass --save to write to DB)')
  }

  await db.destroy()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
