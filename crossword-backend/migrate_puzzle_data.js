const db = require('./db-knex').default

const run = async () => {
  const puzzles = await db('puzzles').select('*')

  for (const puzzle of puzzles) {
    const { title } = puzzle
    console.log('Title', title)

    await db('puzzles')
      .update({ puzzle_number: parseInt(title), book: '3' })
      .where({ id: puzzle.id })
  }
}

run().then(() => {
  process.exit(0)
})
