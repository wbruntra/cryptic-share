export async function up(knex: any): Promise<void> {
  return knex.schema.table('users', (table: any) => {
    table.boolean('is_admin').defaultTo(false).notNullable()
  })
}

export async function down(knex: any): Promise<void> {
  return knex.schema.table('users', (table: any) => {
    table.dropColumn('is_admin')
  })
}
