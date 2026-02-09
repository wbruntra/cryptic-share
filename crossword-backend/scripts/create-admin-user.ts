import db from '../db-knex'
import bcrypt from 'bcryptjs'

async function main() {
  const args = process.argv.slice(2)
  if (args.length < 2) {
    console.error('Usage: bun run scripts/create-admin-user.ts <username> <password>')
    process.exit(1)
  }

  const [username, password] = args

  try {
    const hashedPassword = await bcrypt.hash(password, 10)

    // Check if user exists
    const existing = await db('users').where({ username }).first()
    if (existing) {
      console.log(`User ${username} exists. Updating to admin...`)
      await db('users').where({ username }).update({
        password_hash: hashedPassword,
        is_admin: true,
      })
    } else {
      console.log(`Creating admin user ${username}...`)
      await db('users').insert({
        username,
        password_hash: hashedPassword,
        is_admin: true,
      })
    }

    console.log(`Admin user ${username} ready.`)
  } catch (error) {
    console.error('Error creating admin user:', error)
  } finally {
    await db.destroy()
  }
}

main()
