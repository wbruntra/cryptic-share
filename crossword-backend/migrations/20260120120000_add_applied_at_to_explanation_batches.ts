import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.table('explanation_batches', (table) => {
    table.timestamp('applied_at').nullable()
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.table('explanation_batches', (table) => {
    table.dropColumn('applied_at')
  })
}
