import type { Knex } from "knex";


export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('explanation_reports', (table) => {
    table.increments('id').primary()
    table.integer('puzzle_id').notNullable().references('id').inTable('puzzles')
    table.integer('clue_number').notNullable()
    table.string('direction', 10).notNullable() // 'across' | 'down'
    table.integer('user_id').nullable().references('id').inTable('users')
    table.string('anonymous_id', 36).nullable() // For non-authenticated users
    table.text('feedback').nullable() // Optional feedback from user
    table.boolean('explanation_updated').notNullable().defaultTo(false) 
    table.datetime('reported_at').defaultTo(knex.fn.now())

    // Index for looking up reports
    table.index(['puzzle_id', 'clue_number', 'direction'])
    table.index('reported_at')
  })
}


export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('explanation_reports')
}

