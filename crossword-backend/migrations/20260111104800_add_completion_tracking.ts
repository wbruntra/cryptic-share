import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  // Add letter_count to puzzles - stores count of fillable cells (W and N)
  await knex.schema.alterTable('puzzles', (table) => {
    table.integer('letter_count').nullable()
  })

  // Add is_complete to puzzle_sessions - tracks if all cells are filled
  await knex.schema.alterTable('puzzle_sessions', (table) => {
    table.boolean('is_complete').defaultTo(false)
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('puzzle_sessions', (table) => {
    table.dropColumn('is_complete')
  })

  await knex.schema.alterTable('puzzles', (table) => {
    table.dropColumn('letter_count')
  })
}
