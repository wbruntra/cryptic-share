import type { Knex } from "knex";


export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('users', (table) => {
    table.increments('id').primary();
    table.string('username').unique().notNullable();
    table.string('password_hash').notNullable();
    table.timestamps(true, true);
  });

  await knex.schema.alterTable('puzzle_sessions', (table) => {
    table.integer('user_id').unsigned().nullable();
    table.foreign('user_id').references('users.id');
  });
}


export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('puzzle_sessions', (table) => {
    table.dropColumn('user_id');
  });

  await knex.schema.dropTable('users');
}

