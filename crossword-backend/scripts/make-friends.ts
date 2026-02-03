import db from '../db-knex'

async function makeFriends(username1: string, username2: string) {
  try {
    // Look up both users
    const user1 = await db('users').where({ username: username1 }).first()
    const user2 = await db('users').where({ username: username2 }).first()

    if (!user1) {
      console.error(`❌ User not found: ${username1}`)
      process.exit(1)
    }

    if (!user2) {
      console.error(`❌ User not found: ${username2}`)
      process.exit(1)
    }

    // Ensure user_id_1 < user_id_2 for consistency
    const [smallerId, largerId] =
      user1.id < user2.id ? [user1.id, user2.id] : [user2.id, user1.id]

    // Check if friendship already exists
    const existing = await db('friendships')
      .where({ user_id_1: smallerId, user_id_2: largerId })
      .first()

    if (existing) {
      console.log(`✅ ${username1} and ${username2} are already friends (status: ${existing.status})`)
      process.exit(0)
    }

    // Create friendship
    await db('friendships').insert({
      user_id_1: smallerId,
      user_id_2: largerId,
      status: 'accepted',
      requested_by: smallerId, // Doesn't matter for now
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    console.log(`✅ ${username1} and ${username2} are now friends!`)
    process.exit(0)
  } catch (error) {
    console.error('❌ Error creating friendship:', error)
    process.exit(1)
  }
}

// Parse command line args
const args = process.argv.slice(2)

if (args.length !== 2) {
  console.error('Usage: bun run scripts/make-friends.ts <username1> <username2>')
  process.exit(1)
}

const username1 = args[0]
const username2 = args[1]

if (!username1 || !username2) {
  console.error('Usage: bun run scripts/make-friends.ts <username1> <username2>')
  process.exit(1)
}

makeFriends(username1, username2)
