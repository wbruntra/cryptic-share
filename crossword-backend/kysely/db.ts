import { Kysely } from 'kysely'
import { BunSqliteDialect } from './bun-sqlite-dialect'
import { Database } from 'bun:sqlite'
import type { DB } from './db.d'

const database = new Database('crossword.db')

export const db = new Kysely<DB>({
  dialect: new BunSqliteDialect({
    database,
  }),
})
