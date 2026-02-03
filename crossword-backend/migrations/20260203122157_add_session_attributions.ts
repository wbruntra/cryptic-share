import type { Knex } from "knex";


export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('puzzle_sessions', (table) => {
    table.text('attributions').defaultTo('{}')
  })
}


export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('puzzle_sessions', (table) => {
    table.dropColumn('attributions')
  })
}

