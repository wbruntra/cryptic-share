import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  // Create session_subscriptions table
  await knex.schema.createTable('session_subscriptions', (table) => {
    table.increments('id').primary()
    table
      .string('session_id')
      .notNullable()
      .references('session_id')
      .inTable('puzzle_sessions')
      .onDelete('CASCADE')
    table.string('endpoint').notNullable() // We can't foreign key successfully if endpoints are long or not unique in push_subscriptions yet
    table.timestamp('last_notified').nullable()
    table.boolean('notified').defaultTo(false)
    table.timestamp('created_at').defaultTo(knex.fn.now())

    // Unique constraint: one record per session per endpoint
    table.unique(['session_id', 'endpoint'])
  })

  // Modify push_subscriptions to remove session_id (make it global)
  // Since SQLite capabilities for dropping columns are limited in some versions/configs,
  // we'll just ignore the session_id column going forward, but let's try to drop it if we can.
  // For safety in this environment, we'll just leave it and stop using it.

  // We should ensure 'endpoint' is unique in push_subscriptions now if we want it to be a pure registry.
  // But existing data might have duplicates.
  // Let's rely on the application logic to upsert by endpoint.

  // Migrate existing data?
  // We want to copy existing subscriptions to the new session_subscriptions table
  // so users don't lose their notifications.
  const existing = await knex('push_subscriptions').select('*')
  for (const sub of existing) {
    if (sub.session_id) {
      await knex('session_subscriptions')
        .insert({
          session_id: sub.session_id,
          endpoint: sub.endpoint,
          notified: sub.notified,
        })
        .onConflict(['session_id', 'endpoint'])
        .ignore()
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('session_subscriptions')
}
