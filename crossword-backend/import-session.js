import db from './db-knex'
import session from './data/session.json'

console.log(db)

await db('puzzle_sessions')
  .insert(session)
  .then(() => {
    process.exit(0)
  })
