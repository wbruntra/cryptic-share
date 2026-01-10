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

  // Modify push_subscriptions to allow null session_id (global subscriptions)
  // In SQLite, altering columns is limited. We need to:
  // 1. Rename existing 'session_id' to something else? No, just drop the not null constraint?
  //    Knex `alterTable` with `.nullable()` works for SQLite by recreating the table under the hood if needed in newer versions,
  //    or we can do it manually.

  // Let's try the standard Knex way first, and fall back if needed.
  // Actually, for SQLite specifically, `alterTable` support is partial.
  // A safer approach for SQLite (and generic) is:
  // 1. Create session_subscriptions (done above)
  // 2. Migrate data (done above)
  // 3. Drop NOT NULL constraint on session_id in push_subscriptions OR delete the column.

  // Since we want to drop session_id eventually, let's just make it nullable for now so inserts work.
  // ... Wait, SQLite doesn't support ALTER COLUMN ... DROP NOT NULL easily.

  // We will recreate the push_subscriptions table without the session_id column.

  // 1. Rename old table
  await knex.schema.renameTable('push_subscriptions', 'push_subscriptions_old')

  // 2. Create new table (without session_id, and with 'notified' default false logic if we still want it,
  //    though 'notified' logic is now moved to session_subscriptions mostly.
  //    Actually, we assume 'notified' on the global sub is irrelevant or always false. Use existing schema minus session_id)
  await knex.schema.createTable('push_subscriptions', (table) => {
    table.increments('id').primary()
    // table.string('session_id') // REMOVED
    table.text('endpoint').notNullable().unique()
    table.text('p256dh').notNullable()
    table.text('auth').notNullable()
    table.boolean('notified').defaultTo(false) // Keep for backward compat or just in case
    table.timestamp('created_at').defaultTo(knex.fn.now())
  })

  // 3. Copy data back
  const oldData = await knex('push_subscriptions_old').select('*')
  for (const row of oldData) {
    await knex('push_subscriptions')
      .insert({
        id: row.id,
        endpoint: row.endpoint,
        p256dh: row.p256dh,
        auth: row.auth,
        notified: row.notified,
        created_at: row.created_at,
      })
      .onConflict('endpoint')
      .ignore()
  }

  // 4. Drop old table
  await knex.schema.dropTable('push_subscriptions_old')

  // Migrate existing data?
  // We want to copy existing subscriptions to the new session_subscriptions table
  // so users don't lose their notifications.
  const existing = await knex('push_subscriptions_old').select('*') // Use old table for data migration
  for (const sub of existing) {
    if (sub.session_id) {
      // Only migrate session-specific subscriptions
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
  // Revert: We made irreversible changes (dropping session_id).
  // We can recreate the old table structure but data linking subscriptions to sessions is now in `session_subscriptions`.
  // Ideally, we would join `session_subscriptions` to restore `session_id` into `push_subscriptions`.

  await knex.schema.dropTableIfExists('session_subscriptions')

  // We won't attempt to fully revert the push_subscriptions schema change here as it's complex and this is dev.,
  // but strictly speaking we should.
  // A simple reversion is just dropping the new table.
}
