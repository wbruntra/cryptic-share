import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('puzzles', (table) => {
    table.text('answers_encrypted')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('puzzles', (table) => {
    table.dropColumn('answers_encrypted')
  })
}
