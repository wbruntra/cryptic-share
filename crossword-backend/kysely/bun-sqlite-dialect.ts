import { Database } from 'bun:sqlite'
import {
  SqliteQueryCompiler,
  SqliteAdapter,
  SqliteIntrospector,
  CompiledQuery,
  type Dialect,
  type Driver,
  type DatabaseConnection,
  type QueryResult,
  type DatabaseIntrospector,
  type DialectAdapter,
  type QueryCompiler,
  type Kysely,
} from 'kysely'

function freeze<T extends object>(obj: T): T {
  return Object.freeze(obj)
}

function isFunction<T extends (...args: any[]) => any>(value: unknown): value is T {
  return typeof value === 'function'
}

export interface BunSqliteDialectConfig {
  database: Database | (() => Promise<Database>)
  onCreateConnection?: (connection: DatabaseConnection) => Promise<void>
}

const READ_STATEMENT_RE = /^(select|with|pragma|explain)\b/i

class BunSqliteConnection implements DatabaseConnection {
  #db: Database

  constructor(db: Database) {
    this.#db = db
  }

  async executeQuery(compiledQuery: CompiledQuery): Promise<QueryResult<any>> {
    const { sql, parameters } = compiledQuery
    const stmt = this.#db.query(sql)

    if (READ_STATEMENT_RE.test(sql.trim())) {
      return { rows: (stmt as any).all(...(parameters as any[])) }
    }

    const result = (stmt as any).run(...(parameters as any[])) as {
      changes: number
      lastInsertRowid: number | bigint
    }
    return {
      insertId: result.lastInsertRowid != null ? BigInt(result.lastInsertRowid) : undefined,
      numAffectedRows: result.changes != null ? BigInt(result.changes) : undefined,
      rows: [],
    }
  }

  async *streamQuery(compiledQuery: CompiledQuery, _chunkSize: number) {
    const { sql, parameters } = compiledQuery
    const stmt = this.#db.query(sql)

    if (!READ_STATEMENT_RE.test(sql.trim())) {
      throw new Error('Bun SQLite driver only supports streaming of select queries')
    }

    for (const row of (stmt as any).iterate(...(parameters as any[]))) {
      yield { rows: [row] }
    }
  }
}

export class BunSqliteDriver implements Driver {
  #config: BunSqliteDialectConfig
  #db: Database | null = null
  #connection: BunSqliteConnection | null = null

  constructor(config: BunSqliteDialectConfig) {
    this.#config = freeze({ ...config })
  }

  async init(): Promise<void> {
    this.#db = isFunction(this.#config.database)
      ? await this.#config.database()
      : this.#config.database
    this.#connection = new BunSqliteConnection(this.#db)

    if (this.#config.onCreateConnection) {
      await this.#config.onCreateConnection(this.#connection)
    }
  }

  async acquireConnection(): Promise<DatabaseConnection> {
    return this.#connection!
  }

  async beginTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw('begin'))
  }

  async commitTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw('commit'))
  }

  async rollbackTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw('rollback'))
  }

  async releaseConnection(): Promise<void> {
    // noop - single connection
  }

  async destroy(): Promise<void> {
    this.#db?.close()
  }
}

export class BunSqliteDialect implements Dialect {
  #config: BunSqliteDialectConfig

  constructor(config: BunSqliteDialectConfig) {
    this.#config = freeze({ ...config })
  }

  createDriver(): Driver {
    return new BunSqliteDriver(this.#config)
  }

  createQueryCompiler(): QueryCompiler {
    return new SqliteQueryCompiler()
  }

  createAdapter(): DialectAdapter {
    return new SqliteAdapter()
  }

  createIntrospector(db: Kysely<any>): DatabaseIntrospector {
    return new SqliteIntrospector(db)
  }
}
