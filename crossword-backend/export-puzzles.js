import db from './db-knex'

const exportPuzzles = async () => {
  const puzzles = await db('puzzles').select('*').whereIn('id', [6, 7])
  console.log(puzzles)
}

exportPuzzles().then(() => {
  process.exit(0)
})
