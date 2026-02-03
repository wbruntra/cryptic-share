import type { Knex } from "knex";


export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('friendships', (table) => {
    table.increments('id').primary()
    table.integer('user_id_1').unsigned().notNullable()
    table.integer('user_id_2').unsigned().notNullable()
    table.string('status').notNullable().defaultTo('accepted')
    table.integer('requested_by').unsigned().notNullable()
    table.timestamps(true, true)

    // Foreign keys
    table.foreign('user_id_1').references('users.id').onDelete('CASCADE')
    table.foreign('user_id_2').references('users.id').onDelete('CASCADE')
    table.foreign('requested_by').references('users.id').onDelete('CASCADE')

    // Ensure user_id_1 < user_id_2 to prevent duplicates
    table.unique(['user_id_1', 'user_id_2'])
    table.check('user_id_1 < user_id_2')
  })
}


export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('friendships')
}

