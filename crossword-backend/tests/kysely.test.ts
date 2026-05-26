import { test, expect, afterAll } from 'bun:test'
import { Kysely, sql } from 'kysely'
import { BunSqliteDialect } from '../kysely/bun-sqlite-dialect'
import { Database } from 'bun:sqlite'
import type { DB } from '../kysely/db.d'

const sqlite = new Database(':memory:')
const db = new Kysely<DB>({
  dialect: new BunSqliteDialect({ database: sqlite }),
})

await sql`
  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    is_admin BOOLEAN NOT NULL DEFAULT 0
  )
`.execute(db)

afterAll(() => sqlite.close())

test('basic insert and select', async () => {
  await db.insertInto('users').values({
    username: 'alice',
    password_hash: 'hash1',
  } as any).execute()

  const rows = await db.selectFrom('users').selectAll().execute()
  expect(rows.length).toBe(1)
  expect(rows[0].username).toBe('alice')
  expect(rows[0].id).toBe(1)
})

test('where clause', async () => {
  await db.insertInto('users').values({
    username: 'bob',
    password_hash: 'hash2',
  } as any).execute()

  const user = await db.selectFrom('users')
    .selectAll()
    .where('username', '=', 'bob')
    .executeTakeFirstOrThrow()

  expect(user.username).toBe('bob')
})

test('update', async () => {
  await db.updateTable('users')
    .set({ username: 'alice_updated' } as any)
    .where('username', '=', 'alice')
    .execute()

  const user = await db.selectFrom('users')
    .selectAll()
    .where('username', '=', 'alice_updated')
    .executeTakeFirstOrThrow()

  expect(user.id).toBe(1)
})

test('delete', async () => {
  await db.deleteFrom('users').where('username', '=', 'bob').execute()

  const rows = await db.selectFrom('users').selectAll().execute()
  expect(rows.length).toBe(1)
  expect(rows[0].username).toBe('alice_updated')
})

test('count', async () => {
  const { count } = await db.selectFrom('users')
    .select(db.fn.countAll<number>().as('count'))
    .executeTakeFirstOrThrow()

  expect(count).toBe(1)
})

test('raw sql', async () => {
  const rows = await sql<{ result: number }>`SELECT 1 + 1 AS result`.execute(db)
  expect(rows.rows[0].result).toBe(2)
})

test('streaming', async () => {
  await db.insertInto('users').values([
    { username: 'charlie', password_hash: 'h3' },
    { username: 'diana', password_hash: 'h4' },
  ] as any).execute()

  const names: string[] = []
  for await (const row of db.selectFrom('users')
    .select('username')
    .where('username', 'in', ['alice_updated', 'charlie', 'diana'])
    .stream()) {
    names.push(row.username)
  }

  expect(names.length).toBe(3)
  expect(names.sort()).toEqual(['alice_updated', 'charlie', 'diana'])
})
