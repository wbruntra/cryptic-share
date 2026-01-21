import db from '../db-knex'

// Set applied_at for all batches that have status 'completed'
const result = await db('explanation_batches')
  .where('status', 'completed')
  .whereNull('applied_at')
  .update({
    applied_at: db.fn.now(),
    updated_at: db.fn.now(),
  })

console.log(`Updated ${result} batches with applied_at timestamp`)
process.exit(0)
