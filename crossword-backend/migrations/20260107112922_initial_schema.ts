import type { Knex } from "knex";


export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('puzzles', (table) => {
    table.increments('id').primary();
    table.string('title').notNullable();
    table.text('grid').notNullable();
    table.text('clues').notNullable();
  });

  await knex.schema.createTable('puzzle_sessions', (table) => {
    table.string('session_id').primary();
    table.integer('puzzle_id').unsigned().notNullable();
    table.text('state').notNullable();
    table.foreign('puzzle_id').references('puzzles.id');
  });
}


export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('puzzle_sessions');
  await knex.schema.dropTableIfExists('puzzles');
}


