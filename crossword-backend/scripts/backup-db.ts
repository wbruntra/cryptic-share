/**
 * Backup essential database tables to JSON files
 * Tables backed up: puzzles, puzzle_sessions, users
 */
import db from '../db-knex'
import fs from 'fs'
import path from 'path'

const BACKUP_DIR = path.join(__dirname, '..', 'backups')

async function backup() {
  console.log('Starting database backup...')

  // Create backup directory if it doesn't exist
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true })
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = path.join(BACKUP_DIR, `backup-${timestamp}`)
  fs.mkdirSync(backupPath, { recursive: true })

  // Backup users
  console.log('  Backing up users...')
  const users = await db('users').select('*')
  fs.writeFileSync(path.join(backupPath, 'users.json'), JSON.stringify(users, null, 2))
  console.log(`    ${users.length} users backed up`)

  // Backup puzzles
  console.log('  Backing up puzzles...')
  const puzzles = await db('puzzles').select('*')
  fs.writeFileSync(path.join(backupPath, 'puzzles.json'), JSON.stringify(puzzles, null, 2))
  console.log(`    ${puzzles.length} puzzles backed up`)

  // Backup puzzle_sessions
  console.log('  Backing up puzzle_sessions...')
  const sessions = await db('puzzle_sessions').select('*')
  fs.writeFileSync(
    path.join(backupPath, 'puzzle_sessions.json'),
    JSON.stringify(sessions, null, 2),
  )
  console.log(`    ${sessions.length} sessions backed up`)

  console.log(`\nBackup complete! Files saved to: ${backupPath}`)
  process.exit(0)
}

backup().catch((err) => {
  console.error('Backup failed:', err)
  process.exit(1)
})
