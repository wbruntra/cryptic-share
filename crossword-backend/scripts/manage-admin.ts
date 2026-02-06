#!/usr/bin/env bun
import db from '../db-knex'

async function listUsers() {
  const users = await db('users')
    .select('id', 'username', 'is_admin', 'created_at')
    .orderBy('id')

  console.log('\n=== Users ===\n')
  console.log('ID  | Username          | Admin | Created')
  console.log('-'.repeat(60))
  
  users.forEach(user => {
    const id = String(user.id).padEnd(4)
    const username = String(user.username).padEnd(18)
    const isAdmin = user.is_admin ? '✓' : ' '
    const created = new Date(user.created_at).toISOString().split('T')[0]
    console.log(`${id}| ${username}| ${isAdmin}     | ${created}`)
  })
  
  console.log()
}

async function setAdmin(userId: number, isAdmin: boolean) {
  const user = await db('users').where({ id: userId }).first()
  
  if (!user) {
    console.error(`❌ User with ID ${userId} not found`)
    process.exit(1)
  }

  await db('users')
    .where({ id: userId })
    .update({ is_admin: isAdmin })

  const status = isAdmin ? 'admin' : 'regular user'
  console.log(`✓ Set ${user.username} (ID: ${userId}) as ${status}`)
}

async function main() {
  const args = process.argv.slice(2)
  const command = args[0]

  try {
    if (!command || command === 'list') {
      await listUsers()
    } else if (command === 'set-admin') {
      if (!args[1]) {
        console.error('Usage: bun run scripts/manage-admin.ts set-admin <user-id>')
        process.exit(1)
      }
      const userId = parseInt(args[1])
      if (isNaN(userId)) {
        console.error('Usage: bun run scripts/manage-admin.ts set-admin <user-id>')
        process.exit(1)
      }
      await setAdmin(userId, true)
      await listUsers()
    } else if (command === 'remove-admin') {
      if (!args[1]) {
        console.error('Usage: bun run scripts/manage-admin.ts remove-admin <user-id>')
        process.exit(1)
      }
      const userId = parseInt(args[1])
      if (isNaN(userId)) {
        console.error('Usage: bun run scripts/manage-admin.ts remove-admin <user-id>')
        process.exit(1)
      }
      await setAdmin(userId, false)
      await listUsers()
    } else {
      console.log('Usage:')
      console.log('  bun run scripts/manage-admin.ts list')
      console.log('  bun run scripts/manage-admin.ts set-admin <user-id>')
      console.log('  bun run scripts/manage-admin.ts remove-admin <user-id>')
    }
  } catch (error) {
    console.error('Error:', error)
    process.exit(1)
  } finally {
    await db.destroy()
  }
}

main()
