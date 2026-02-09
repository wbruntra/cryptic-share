import db from '../db-knex'
console.log(await db('puzzles').count('id as count').first())
await db.destroy()
