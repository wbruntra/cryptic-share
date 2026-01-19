import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('clue_explanations', (table) => {
    table.increments('id').primary()
    table.integer('puzzle_id').notNullable().references('id').inTable('puzzles')
    table.integer('clue_number').notNullable()
    table.string('direction', 10).notNullable() // 'across' | 'down'
    table.text('clue_text').notNullable()
    table.text('answer').notNullable()
    table.text('explanation_json').notNullable() // Full OpenAI response as JSON
    table.datetime('created_at').defaultTo(knex.fn.now())

    // Unique constraint: one explanation per clue per puzzle
    table.unique(['puzzle_id', 'clue_number', 'direction'])
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('clue_explanations')
}
