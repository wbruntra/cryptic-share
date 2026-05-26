import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('parsewords_puzzles', (table) => {
    table.increments('id').primary()
    table.integer('puzzle_id').notNullable().references('id').inTable('puzzles')
    table.integer('clue_number').notNullable()
    table.string('direction', 10).notNullable() // 'across' | 'down'
    table.text('puzzle_json').notNullable()      // ParsewordsPuzzle serialised as JSON
    table.datetime('created_at').defaultTo(knex.fn.now())
    table.datetime('updated_at').defaultTo(knex.fn.now())

    // One parsewords puzzle per clue per puzzle — same key as clue_explanations
    table.unique(['puzzle_id', 'clue_number', 'direction'])
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('parsewords_puzzles')
}
