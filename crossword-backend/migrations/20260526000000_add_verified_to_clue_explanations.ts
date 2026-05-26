import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('clue_explanations', (table) => {
    table.boolean('verified').defaultTo(false)
    table.timestamp('verified_at').nullable()
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('clue_explanations', (table) => {
    table.dropColumn('verified_at')
    table.dropColumn('verified')
  })
}
