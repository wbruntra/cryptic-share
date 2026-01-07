import { db } from './db'
import * as puzzle from './puzzle'

const run = async () => {
  // get all puzzles
  const puzzles = puzzle.getAllPuzzles()

  console.log(puzzles)

  // delete puzzle with id 2

  puzzle.deletePuzzle(2)

  const puzzlesAfterDelete = puzzle.getAllPuzzles()
  console.log(puzzlesAfterDelete)
}

if (import.meta.main) {
  await run()
}