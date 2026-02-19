import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Drop old push notification tables - we're starting fresh
  await knex.schema.dropTableIfExists('session_subscriptions')
  await knex.schema.dropTableIfExists('push_subscriptions')
}

export async function down(knex: Knex): Promise<void> {
  // We're not recreating the old tables - this is a clean break
  // If needed, the tables can be restored from the original migrations
  console.log('Down migration: old push tables were permanently removed')
}
