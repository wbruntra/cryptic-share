import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('puzzle_sessions', (table) => {
    table.string('anonymous_id').nullable().index()
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('puzzle_sessions', (table) => {
    table.dropIndex(['anonymous_id'])
    table.dropColumn('anonymous_id')
  })
}
