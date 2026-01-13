import { resolve } from 'path'
import { checkSessionAnswers } from '../utils/answerChecker'
import { PuzzleService } from '../services/puzzleService'

async function runCheck() {
  const sessionPath = resolve(process.cwd(), 'data/session.json')
  const sessionFile = Bun.file(sessionPath)

  if (!(await sessionFile.exists())) {
    console.error('Session file not found at data/session.json')
    process.exit(1)
  }

  const session = await sessionFile.json()

  console.log(`Checking session ${session.session_id} for puzzle ${session.puzzle_id}...`)

  try {
    // Parse the state string from JSON
    const state = JSON.parse(session.state)

    // Check answers
    const { results, totalClues, totalLetters, filledLetters } = await checkSessionAnswers(
      session.puzzle_id,
      state,
    )

    console.log(`checked ${results.length}/${totalClues} clues`)
    console.log(`letters: ${filledLetters}/${totalLetters}`)

    const incorrect = results.filter((r) => !r.isCorrect)
    const correct = results.filter((r) => r.isCorrect).length
    const total = results.length

    console.log(`\nResults: ${correct}/${total} correct`)
    console.log('----------------------------------------')

    results.forEach((r) => {
      const status = r.isCorrect ? '✅' : '❌'
      console.log(
        `${status} ${r.number}${r.direction[0].toUpperCase()}: User="${r.userAnswer}", Correct="${
          r.correctAnswer
        }"`,
      )
    })
  } catch (error) {
    console.error('Error checking session:', error)
  }

  process.exit(0)
}

if (import.meta.main) {
  runCheck()
}
