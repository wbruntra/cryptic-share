import { transcribeAnswers } from '../utils/openai'
import db from '../db-knex'
import type { PuzzleAnswers } from '../utils/answerSchema'
import { resolve } from 'path'

// Remove accent marks from string
const removeAccents = (str: string): string => {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

// ROT13 implementation
const rot13 = (str: string): string => {
  return str.replace(/[a-zA-Z]/g, (char) => {
    const base = char <= 'Z' ? 65 : 97
    return String.fromCharCode(((char.charCodeAt(0) - base + 13) % 26) + base)
  })
}

const encodePuzzleAnswers = (puzzle: PuzzleAnswers): PuzzleAnswers => {
  return {
    ...puzzle,
    across: puzzle.across.map((clue) => ({
      ...clue,
      answer: rot13(removeAccents(clue.answer)),
    })),
    down: puzzle.down.map((clue) => ({
      ...clue,
      answer: rot13(removeAccents(clue.answer)),
    })),
  }
}

const updateAnswersInDatabase = async (puzzles: PuzzleAnswers[], book: string) => {
  let updated = 0
  let missing = 0

  for (const answers of puzzles) {
    const puzzleMatch = await db('puzzles')
      .select('id')
      .where({
        puzzle_number: answers.puzzle_id,
        book,
      })
      .first()

    if (!puzzleMatch) {
      missing += 1
      console.log(`No match found for puzzle ${answers.puzzle_id} (book ${book})`)
      continue
    }

    await db('puzzles')
      .update({
        answers_encrypted: JSON.stringify(answers),
      })
      .where({
        id: puzzleMatch.id,
      })

    updated += 1
    console.log(`Updated puzzle ${answers.puzzle_id}`)
  }

  return { updated, missing }
}

const main = async () => {
  const imagePath = Bun.argv[2]
  const book = Bun.argv[3] ?? '3'

  if (!imagePath) {
    console.error('Usage: bun scripts/transcribe-answers.ts <image_path> [book]')
    process.exit(1)
  }

  try {
    const absolutePath = resolve(process.cwd(), imagePath)
    console.log(`Transcribing answers from ${absolutePath} for book ${book}...`)

    const file = Bun.file(absolutePath)
    const result = await transcribeAnswers(file)

    const encodedPuzzles = result.puzzles.map(encodePuzzleAnswers)
    const summary = await updateAnswersInDatabase(encodedPuzzles, book)

    console.log(
      `Done. Updated ${summary.updated} puzzle(s), ${summary.missing} puzzle(s) had no DB match.`
    )
  } catch (error) {
    console.error('Error:', error)
    process.exit(1)
  } finally {
    await db.destroy()
  }
}

if (import.meta.main) {
  main()
}
