const db = require('../db-knex').default
const answers_data = require('../transcribed_answers.json')

const run = async () => {
  const puzzles = await db('puzzles').select('*')

  for (const answers of answers_data.puzzles) {
    // console.log(JSON.stringify(answers))

    const puzzleMatch = await db('puzzles')
      .select('*')
      .where({
        puzzle_number: answers.puzzle_id,
        book: '3',
      })
      .first()

    if (!puzzleMatch) {
      console.log('No match found for puzzle', answers.puzzle_id)
      continue
    }

    await db('puzzles')
      .update({
        answers_encrypted: JSON.stringify(answers),
      })
      .where({
        id: puzzleMatch.id,
      })

    console.log('Updated puzzle', answers.puzzle_id)
  }
}

run().then(() => {
  process.exit(0)
})
