import db from '../db-knex'
import { constructGridFromAnswerKey } from '../utils/gridConstructor'
import { calculateLetterCount } from '../utils/stateHelpers'

function removeAccents(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function rot13(str: string): string {
  return str.replace(/[a-zA-Z]/g, (char) => {
    const base = char <= 'Z' ? 65 : 97
    return String.fromCharCode(((char.charCodeAt(0) - base + 13) % 26) + base)
  })
}

function normalizeAnswer(answer: string): string {
  return removeAccents(answer).toUpperCase().replace(/[^A-Z0-9]/g, '')
}

const puzzleNumber = 172
const book = '3'

const across = [
  { number: 1, answer: 'Well-balanced' },
  { number: 8, answer: 'Misuser' },
  { number: 9, answer: 'Rooftop' },
  { number: 11, answer: 'Extenuated' },
  { number: 12, answer: 'Bulb' },
  { number: 14, answer: 'Tabletop' },
  { number: 16, answer: 'Lintel' },
  { number: 17, answer: 'Son' },
  { number: 19, answer: 'Nickel' },
  { number: 21, answer: 'Downward' },
  { number: 24, answer: 'Nosy' },
  { number: 25, answer: 'Arabesques' },
  { number: 27, answer: 'Erosion' },
  { number: 28, answer: 'Imitate' },
  { number: 29, answer: 'Skipping rope' },
]

const down = [
  { number: 1, answer: 'Washtub' },
  { number: 2, answer: 'Los Angeles' },
  { number: 3, answer: 'Barbados' },
  { number: 4, answer: 'Larder' },
  { number: 5, answer: 'Noon' },
  { number: 6, answer: 'Entrust' },
  { number: 7, answer: 'Impertinence' },
  { number: 10, answer: 'Pebble-dashed' },
  { number: 13, answer: 'Pianissimo' },
  { number: 15, answer: 'Pod' },
  { number: 18, answer: 'Nobbling' },
  { number: 20, answer: 'Cassock' },
  { number: 22, answer: 'Adulate' },
  { number: 23, answer: 'Brunei' }, // CORRECTED ANSWER!
  { number: 26, answer: 'Wisp' },
]

async function main() {
  console.log(`Manually constructing and inserting Puzzle #${puzzleNumber} for Book ${book}...`)

  const normalizedAcross = across.map(a => ({ number: a.number, answer: normalizeAnswer(a.answer) }))
  const normalizedDown = down.map(d => ({ number: d.number, answer: normalizeAnswer(d.answer) }))

  // Construct grid
  const constructed = constructGridFromAnswerKey(
    {
      width: 15,
      height: 15,
      across: normalizedAcross,
      down: normalizedDown,
    },
    { maxStates: 2_000_000, maxMillis: 15_000 }
  )

  if (!constructed.success || !constructed.gridString) {
    console.error('Error: Failed to construct grid from the answers:', constructed.message)
    process.exit(1)
  }

  const grid = constructed.gridString
  console.log('🧩 Grid constructed successfully!')

  const encryptedAnswers = {
    puzzle_id: puzzleNumber,
    across: across.map((a) => ({
      number: a.number,
      answer: rot13(removeAccents(a.answer)),
    })),
    down: down.map((d) => ({
      number: d.number,
      answer: rot13(removeAccents(d.answer)),
    })),
  }

  const placeholderClues = {
    across: across.map((a) => ({ number: a.number, clue: '[CLUE PENDING]' })),
    down: down.map((d) => ({ number: d.number, clue: '[CLUE PENDING]' })),
  }

  const payload = {
    title: String(puzzleNumber),
    grid,
    clues: JSON.stringify(placeholderClues),
    answers_encrypted: JSON.stringify(encryptedAnswers),
    letter_count: calculateLetterCount(grid),
    puzzle_number: puzzleNumber,
    book,
    is_published: false,
  }

  // Check if puzzle already exists
  const existing = await db('puzzles')
    .where({ book, puzzle_number: puzzleNumber })
    .first('id')

  if (existing) {
    await db('puzzles').where({ id: existing.id }).update(payload)
    console.log(`♻️ Updated existing puzzle ID: ${existing.id}`)
  } else {
    const [newId] = await db('puzzles').insert(payload)
    console.log(`✅ Successfully created new puzzle ID: ${newId}`)
  }

  await db.destroy()
}

main().catch(async (error) => {
  console.error('Fatal error:', error)
  await db.destroy()
  process.exit(1)
})
