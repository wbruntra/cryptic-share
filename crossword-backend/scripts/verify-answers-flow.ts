import axios from 'axios'
import db from '../db-knex'

async function verifyAnswersFlow() {
  console.log('Verifying answers flow...')

  // 1. Create a dummy puzzle via direct DB insertion (to skip auth for test if needed, or use service)
  // Let's use service logic via direct DB access to ensure we are testing the service layer flow if possible,
  // but since we want to test the full route/service integration, we'll try to hit the API or just check DB after service calls.

  // Mock data
  const answersEncrypted = {
    puzzles: [{ across: [{ number: 1, answer: 'Rotten' }] }],
  }

  // Insert via DB to get an ID
  const [id] = await db('puzzles').insert({
    title: 'Test Puzzle',
    grid: 'W W',
    clues: JSON.stringify({ across: [], down: [] }),
    letter_count: 0,
  })

  console.log(`Created test puzzle with ID: ${id}`)

  // 2. Update via API/Service equivalent Logic (Simulating Put Route)
  // We'll call the Service directly to avoid starting the express server in this script
  const { PuzzleService } = await import('../services/puzzleService')

  await PuzzleService.updatePuzzle(id, {
    answers: answersEncrypted,
  })

  // 3. Retrieve and Verify
  const puzzle = await PuzzleService.getPuzzleById(id)

  console.log('Retrieved Puzzle:', JSON.stringify(puzzle, null, 2))

  if (!puzzle.answers) {
    console.error('FAILED: Answers property missing from response')
    process.exit(1)
  }

  // Verify it matches what we sent (it should be stored as stringified JSON in DB, parsed back in Service)
  // Wait, our service implementation:
  // dbUpdates.answers_encrypted = JSON.stringify((updates as any).answers)
  // puzzle.answers = JSON.parse(puzzle.answers_encrypted)

  // So retrieving it should be the object
  if (JSON.stringify(puzzle.answers) === JSON.stringify(answersEncrypted)) {
    console.log('SUCCESS: Answers stored and retrieved correctly')
  } else {
    console.error('FAILED: Answers mismatch')
    console.error('Expected:', answersEncrypted)
    console.error('Got:', puzzle.answers)
    process.exit(1)
  }

  // Clean up
  await db('puzzles').where({ id }).del()
  process.exit(0)
}

if (import.meta.main) {
  verifyAnswersFlow()
}
