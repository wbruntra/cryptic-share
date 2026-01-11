/**
 * Restore database tables from JSON backup files
 * Usage: bun run scripts/restore-db.ts <backup-folder-path>
 * Example: bun run scripts/restore-db.ts backups/backup-2026-01-11T10-57-26-000Z
 */
import db from '../db-knex'
import fs from 'fs'
import path from 'path'

async function restore() {
  const backupPath = process.argv[2]

  if (!backupPath) {
    console.error('Usage: bun run scripts/restore-db.ts <backup-folder-path>')
    console.error('Example: bun run scripts/restore-db.ts backups/backup-2026-01-11T10-57-26-000Z')
    process.exit(1)
  }

  const absolutePath = path.isAbsolute(backupPath)
    ? backupPath
    : path.join(__dirname, '..', backupPath)

  if (!fs.existsSync(absolutePath)) {
    console.error(`Backup folder not found: ${absolutePath}`)
    process.exit(1)
  }

  console.log(`Starting restore from: ${absolutePath}`)
  console.log(
    'WARNING: This will replace existing data in users, puzzles, and puzzle_sessions tables!',
  )
  console.log('')

  // Restore users first (no foreign keys depend on them being restored first for puzzles/sessions)
  const usersFile = path.join(absolutePath, 'users.json')
  if (fs.existsSync(usersFile)) {
    console.log('  Restoring users...')
    const users = JSON.parse(fs.readFileSync(usersFile, 'utf-8'))
    if (users.length > 0) {
      // Delete existing and insert
      await db('puzzle_sessions').whereNotNull('user_id').update({ user_id: null })
      await db('users').del()
      await db('users').insert(users)
      console.log(`    ${users.length} users restored`)
    } else {
      console.log('    No users to restore')
    }
  }

  // Restore puzzles
  const puzzlesFile = path.join(absolutePath, 'puzzles.json')
  if (fs.existsSync(puzzlesFile)) {
    console.log('  Restoring puzzles...')
    const puzzles = JSON.parse(fs.readFileSync(puzzlesFile, 'utf-8'))
    if (puzzles.length > 0) {
      // Delete sessions first (foreign key), then puzzles
      await db('puzzle_sessions').del()
      await db('puzzles').del()
      await db('puzzles').insert(puzzles)
      console.log(`    ${puzzles.length} puzzles restored`)
    } else {
      console.log('    No puzzles to restore')
    }
  }

  // Restore puzzle_sessions
  const sessionsFile = path.join(absolutePath, 'puzzle_sessions.json')
  if (fs.existsSync(sessionsFile)) {
    console.log('  Restoring puzzle_sessions...')
    const sessions = JSON.parse(fs.readFileSync(sessionsFile, 'utf-8'))
    if (sessions.length > 0) {
      await db('puzzle_sessions').del()
      await db('puzzle_sessions').insert(sessions)
      console.log(`    ${sessions.length} sessions restored`)
    } else {
      console.log('    No sessions to restore')
    }
  }

  console.log('\nRestore complete!')
  process.exit(0)
}

restore().catch((err) => {
  console.error('Restore failed:', err)
  process.exit(1)
})
