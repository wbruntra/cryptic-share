import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('puzzles', (table) => {
    table.string('book')
    table.integer('puzzle_number')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('puzzles', (table) => {
    table.dropColumn('book')
    table.dropColumn('puzzle_number')
  })
}
