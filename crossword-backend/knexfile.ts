import type { Knex } from 'knex'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const unifiedConfig = {
  client: 'sqlite3',
  connection: {
    filename: path.join(__dirname, 'crossword.db'),
  },
  useNullAsDefault: true,
}

const config: { [key: string]: Knex.Config } = {
  development: {
    client: 'sqlite3',
    connection: {
      filename: path.join(__dirname, 'crossword.db'),
    },
    useNullAsDefault: true,
  },

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
