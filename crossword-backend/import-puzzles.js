import db from './db-knex'

const newPuzzles = []

const importPuzzles = async () => {
  for (const puzzle of newPuzzles) {
    await db('puzzles').insert({ title: puzzle.title, grid: puzzle.grid, clues: puzzle.clues })
  }
}

importPuzzles().then(() => {
  process.exit(0)
})
