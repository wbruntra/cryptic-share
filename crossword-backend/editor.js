import db from './db-knex'
import fs from 'fs/promises'

const run = async () => {
  const sessions = await db('puzzle_sessions as ps').join('puzzles as p').where({user_id: 1, puzzle_id: 1}).select(['ps.*', 'p.title', 'p.id as puzzle_id'])

  console.log(sessions.length)

  await fs.writeFile('./sessions-user1-puzzle1.json', JSON.stringify(sessions, null, 2))

  // const sessionsToDelete = await db('puzzle_sessions').whereNot({session_id: 'IVglTduB3978'}).select()

  // console.log('sessionsToDelete', sessionsToDelete.length)
}

run().then(() => process.exit(0))