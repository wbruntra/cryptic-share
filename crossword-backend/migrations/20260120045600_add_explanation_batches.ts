import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('explanation_batches', (table) => {
    table.increments('id').primary()
    table.string('batch_id').notNullable().unique()
    table
      .integer('puzzle_id')
      .notNullable()
      .references('id')
      .inTable('puzzles')
      .onDelete('CASCADE')
    table.string('status').notNullable()
    table.string('input_file_id').notNullable()
    table.string('output_file_id')
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.timestamp('updated_at').defaultTo(knex.fn.now())
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('explanation_batches')
}
