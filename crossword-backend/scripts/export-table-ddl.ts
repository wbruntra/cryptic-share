import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'fs'
import path from 'path'
import config from '@/knexfile.ts'

console.log(config)

const env = process.env.NODE_ENV || 'development'
// @ts-ignore
const dbPath = config[env].connection.filename
const tablesDir = path.join(__dirname, '..', 'ddl')

if (!existsSync(dbPath)) {
  console.error('Database file not found:', dbPath)
  process.exit(1)
}

if (!existsSync(tablesDir)) {
  mkdirSync(tablesDir)
}

// Query database for all table names
const getTablesQuery = `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
const tablesResult = Bun.spawnSync({
  cmd: ['sqlite3', dbPath, getTablesQuery],
})

const tablesOutput = tablesResult.stdout.toString().trim()
if (!tablesOutput) {
  console.error('No tables found in database')
  process.exit(1)
}

const tables = tablesOutput.split('\n').filter((name) => name.trim() !== '')
console.log(`Found ${tables.length} table(s): ${tables.join(', ')}\n`)

function formatDDL(ddl: string): string {
  if (!ddl.includes('(') || !ddl.includes(')')) return ddl

  const match = ddl.match(/^(CREATE TABLE.*?)\((.*)\)$/s)
  if (!match) return ddl

  // @ts-ignore
  const header = match[1].trim()
  const columnsStr = match[2]
  // @ts-ignore
  const columns = columnsStr.split(',').map((col, i, arr) => {
    const trimmed = col.trim()
    const suffix = i < arr.length - 1 ? ',' : ''
    return `  ${trimmed}${suffix}`
  })

  return `${header} (\n${columns.join('\n')}\n)`
}

for (const table of tables) {
  const sql = `SELECT sql FROM sqlite_master WHERE type='table' AND name='${table}'`
  const escapedDbPath = dbPath.replace(/'/g, "'\"'\"'")
  const result = Bun.spawnSync({
    cmd: ['sqlite3', dbPath, sql],
  })
  const ddl = result.stdout.toString().trim()
  if (ddl) {
    const formatted = formatDDL(ddl)
    writeFileSync(path.join(tablesDir, `${table}.sql`), formatted)
    console.log(`Exported: ${table}.sql`)
  }
}
