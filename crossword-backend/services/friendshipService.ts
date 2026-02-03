import db from '../db-knex'

interface User {
  id: number
  username: string
}

export class FriendshipService {
  /**
   * Get all accepted friends for a user
   */
  static async getFriends(userId: number): Promise<User[]> {
    // Query friendships where user is either user_id_1 or user_id_2
    const friendships = await db('friendships')
      .where('status', 'accepted')
      .andWhere(function () {
        this.where('user_id_1', userId).orWhere('user_id_2', userId)
      })
      .select('user_id_1', 'user_id_2')

    // Extract friend IDs (the other user in each friendship)
    const friendIds = friendships.map((f: any) =>
      f.user_id_1 === userId ? f.user_id_2 : f.user_id_1,
    )

    if (friendIds.length === 0) {
      return []
    }

    // Fetch friend user records
    const friends = await db('users').whereIn('id', friendIds).select('id', 'username')

    return friends
  }

  /**
   * Get friend IDs only (useful for queries)
   */
  static async getFriendIds(userId: number): Promise<number[]> {
    const friendships = await db('friendships')
      .where('status', 'accepted')
      .andWhere(function () {
        this.where('user_id_1', userId).orWhere('user_id_2', userId)
      })
      .select('user_id_1', 'user_id_2')

    return friendships.map((f: any) => (f.user_id_1 === userId ? f.user_id_2 : f.user_id_1))
  }

  /**
   * Check if two users are friends
   */
  static async areFriends(userId1: number, userId2: number): Promise<boolean> {
    const [smallerId, largerId] = userId1 < userId2 ? [userId1, userId2] : [userId2, userId1]

    const friendship = await db('friendships')
      .where({
        user_id_1: smallerId,
        user_id_2: largerId,
        status: 'accepted',
      })
      .first()

    return !!friendship
  }

  /**
   * Create a friendship (for CLI script use)
   */
  static async createFriendship(
    userId1: number,
    userId2: number,
    status: 'accepted' | 'pending' = 'accepted',
  ): Promise<void> {
    const [smallerId, largerId] = userId1 < userId2 ? [userId1, userId2] : [userId2, userId1]

    await db('friendships').insert({
      user_id_1: smallerId,
      user_id_2: largerId,
      status,
      requested_by: smallerId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
  }
}
