import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('explanation_regenerations', (table) => {
    table.string('request_id', 36).primary()
    table.text('clue_text').notNullable()
    table.text('answer').notNullable()
    table.text('feedback').nullable()
    table.text('previous_explanation_json').nullable()
    table.text('explanation_json').nullable()
    table.string('status', 20).notNullable().defaultTo('pending')
    table.text('error_message').nullable()
    table.datetime('created_at').defaultTo(knex.fn.now())
    table.datetime('updated_at').defaultTo(knex.fn.now())

    table.index(['status', 'created_at'])
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('explanation_regenerations')
}
