import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('session_push_subscriptions', (table) => {
    table.increments('id').primary()
    table.string('session_id').notNullable().references('session_id').inTable('puzzle_sessions').onDelete('CASCADE')
    table.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
    table.text('endpoint').notNullable()
    table.text('p256dh').notNullable()
    table.text('auth').notNullable()
    table.timestamp('last_notified_at').nullable()
    table.timestamp('created_at').defaultTo(knex.fn.now())

    // One subscription per user per session
    table.unique(['session_id', 'user_id'], { indexName: 'uq_session_push_sub_session_user' })
    // Index for efficiently finding subscriptions by session
    table.index('session_id', 'idx_session_push_sub_session')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('session_push_subscriptions')
}
