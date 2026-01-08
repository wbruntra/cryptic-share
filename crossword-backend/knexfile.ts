import type { Knex } from 'knex'

// Update with your config settings.

const unifiedConfig = {
  client: 'sqlite3',
  connection: {
    filename: './crossword.db',
  },
  useNullAsDefault: true,
}

const config: { [key: string]: Knex.Config } = {
  development: unifiedConfig,

  staging: unifiedConfig,

  production: unifiedConfig,

  test: {
    client: 'sqlite3',
    connection: {
      filename: ':memory:',
    },
    useNullAsDefault: true,
    migrations: {
      tableName: 'knex_migrations',
    },
  },
}

export default config
