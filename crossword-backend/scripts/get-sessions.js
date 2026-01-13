import db from '../db-knex'

const run = async () => {
  const sessions = await db('puzzle_sessions').select('*').orderBy('puzzle_id')
  console.log(JSON.stringify(sessions, null,2))
}

run().then(() => {
  process.exit(0 )
})