import db from './db-knex'

const exportPuzzles = async () => {
  const puzzles = await db('puzzles').select('*')
  // console.log(puzzles)

  for (const puzzle of puzzles) {
    console.log(puzzle.title)
    console.log('----')
    console.log(puzzle.grid)
    console.log('----')
    console.log(puzzle.clues)
  }
}

exportPuzzles().then(() => {
  process.exit(0)
})
