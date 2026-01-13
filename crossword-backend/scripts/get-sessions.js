import db from '../db-knex'

const run = async () => {
  const sessions = await db('puzzle_sessions').select('*').orderBy('puzzle_id')
  
  const blankSessions = await db('puzzle_sessions').select('*').where('state', '[]')
  
  // console.log(JSON.stringify(sessions, null,2))
  console.log(JSON.stringify(blankSessions, null,2))

  await db('puzzle_sessions').where('state', '[]').del()
}

run().then(() => {
  process.exit(0 )
})