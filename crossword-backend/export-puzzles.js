import db from './db-knex'

const exportPuzzles = async () => {
  const puzzles = await db('puzzles').select('*')
  console.log(puzzles)
}

exportPuzzles().then(() => {
  process.exit(0)
})
