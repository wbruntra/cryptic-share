import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  // SQLite limitation: ALTER TABLE ADD COLUMN doesn't support CURRENT_TIMESTAMP as default
  // Workaround: Add columns without default, then update existing rows
  // For new inserts, we'll handle timestamps in the application code

  await knex.schema.alterTable('puzzle_sessions', (table) => {
    table.timestamp('created_at')
    table.timestamp('updated_at')
  })

  // Set timestamps for existing rows to current time
  const now = new Date().toISOString()
  await knex('puzzle_sessions').whereNull('created_at').update({
    created_at: now,
    updated_at: now,
  })
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.alterTable('puzzle_sessions', (table) => {
    table.dropColumn('created_at')
    table.dropColumn('updated_at')
  })
}
