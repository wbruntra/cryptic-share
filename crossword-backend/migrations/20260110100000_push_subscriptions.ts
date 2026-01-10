import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('push_subscriptions', (table) => {
    table.increments('id').primary()
    table.string('session_id').notNullable()
    table.text('endpoint').notNullable().unique()
    table.text('p256dh').notNullable()
    table.text('auth').notNullable()
    table.boolean('notified').defaultTo(false)
    table.timestamp('created_at').defaultTo(knex.fn.now())

    table.index('session_id')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('push_subscriptions')
}
