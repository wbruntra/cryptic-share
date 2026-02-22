import webpush from 'web-push'
import db from '../db-knex'

// Configure web-push with VAPID keys
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY
const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:example@example.com'

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)
}

interface PushSubscription {
  endpoint: string
  keys: {
    p256dh: string
    auth: string
  }
}

// 20-minute cooldown in milliseconds
const NOTIFICATION_COOLDOWN_MS = 20 * 60 * 1000

export class PushService {
  /**
   * Get VAPID public key for frontend subscription
   */
  static getVapidPublicKey(): string | undefined {
    return vapidPublicKey
  }

  /**
   * Subscribe a user to push notifications for a specific session
   */
  static async subscribeToSession(
    sessionId: string,
    userId: number,
    subscription: PushSubscription,
  ): Promise<void> {
    const { endpoint, keys } = subscription

    // Upsert subscription (one per user per session)
    await db('session_push_subscriptions')
      .insert({
        session_id: sessionId,
        user_id: userId,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
      })
      .onConflict(['session_id', 'user_id'])
      .merge({
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        last_notified_at: null, // Reset cooldown on resubscribe
      })

    console.log(`[Push] User ${userId} subscribed to session ${sessionId}`)
  }

  /**
   * Unsubscribe a user from push notifications for a session
   */
  static async unsubscribeFromSession(sessionId: string, userId: number): Promise<void> {
    await db('session_push_subscriptions')
      .where({ session_id: sessionId, user_id: userId })
      .del()

    console.log(`[Push] User ${userId} unsubscribed from session ${sessionId}`)
  }

  /**
   * Check if a user is subscribed to a session
   */
  static async isSubscribed(sessionId: string, userId: number): Promise<boolean> {
    const subscription = await db('session_push_subscriptions')
      .where({ session_id: sessionId, user_id: userId })
      .first()

    return !!subscription
  }

  /**
   * Notify all subscribers of a session when a word is claimed.
   * Excludes the user who made the claim and respects the 20-min cooldown.
   */
  static async notifyOnWordClaim(
    sessionId: string,
    puzzleTitle: string,
    claimingUserId: number | null,
    claimingUsername: string,
    clueKey: string,
  ): Promise<void> {
    if (!vapidPublicKey || !vapidPrivateKey) {
      console.warn('[Push] Push notifications not configured (missing VAPID keys)')
      return
    }

    // Try to look up the decrypted answer word for the clue
    let word: string | null = null
    try {
      const direction = clueKey.endsWith('-across') ? 'across' : 'down'
      const number = parseInt(clueKey.replace(/-(?:across|down)$/, ''))
      const sessionRow = await db('puzzle_sessions')
        .where('session_id', sessionId)
        .select('puzzle_id')
        .first()
      if (sessionRow) {
        const { getCorrectAnswersStructure, rot13 } = await import('../utils/answerChecker')
        const { puzzleAnswers } = await getCorrectAnswersStructure(sessionRow.puzzle_id)
        const answerEntry = puzzleAnswers?.[direction]?.find((a: any) => a.number === number)
        if (answerEntry) {
          word = rot13(answerEntry.answer).toUpperCase().replace(/[^A-Z]/g, '')
        }
      }
    } catch (e) {
      // Fall back gracefully if answer lookup fails
    }

    const notificationBody = word
      ? `${claimingUsername} solved ${word} (${clueKey}) in "${puzzleTitle}"`
      : `${claimingUsername} solved ${clueKey} in "${puzzleTitle}"`

    const now = new Date()
    const cooldownThreshold = new Date(now.getTime() - NOTIFICATION_COOLDOWN_MS)

    console.log(`[Push] Notifying subscribers for session ${sessionId} (word claimed)`)

    // Get all subscriptions for this session
    // - Exclude the user who made the claim
    // - Only include subscriptions where last_notified_at is null or > 20 mins ago
    let subscriptionsQuery = db('session_push_subscriptions')
      .where('session_id', sessionId)
      .where(function () {
        this.whereNull('last_notified_at').orWhere('last_notified_at', '<', cooldownThreshold)
      })

    // Exclude the claiming user if they have a userId
    if (claimingUserId) {
      subscriptionsQuery = subscriptionsQuery.whereNot('user_id', claimingUserId)
    }

    const subscriptions = await subscriptionsQuery.select('*')

    if (subscriptions.length === 0) {
      console.log(`[Push] No eligible subscribers for session ${sessionId}`)
      return
    }

    console.log(`[Push] Found ${subscriptions.length} eligible subscribers for session ${sessionId}`)

    const payload = JSON.stringify({
      title: 'Word Claimed!',
      body: notificationBody,
      url: `/play/${sessionId}`,
    })

    // Send notifications and update last_notified_at
    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          },
          payload,
        )

        // Update last_notified_at to now
        await db('session_push_subscriptions')
          .where({ id: sub.id })
          .update({ last_notified_at: now.toISOString() })

        console.log(`[Push] Notification sent to user ${sub.user_id} for session ${sessionId}`)
      } catch (error: any) {
        // Handle expired/invalid subscriptions
        if (error.statusCode === 404 || error.statusCode === 410) {
          console.log(`[Push] Removing expired subscription for user ${sub.user_id} in session ${sessionId}`)
          await db('session_push_subscriptions').where({ id: sub.id }).del()
        } else {
          console.error(`[Push] Notification error for user ${sub.user_id}:`, error)
        }
      }
    }
  }

  /**
   * Get all subscriptions for a session (for admin/debugging)
   */
  static async getSessionSubscriptions(sessionId: string) {
    return db('session_push_subscriptions')
      .where({ session_id: sessionId })
      .select('user_id', 'last_notified_at', 'created_at')
  }

  /**
   * Clean up all subscriptions for a user (called on account deletion)
   */
  static async removeAllUserSubscriptions(userId: number): Promise<void> {
    const count = await db('session_push_subscriptions')
      .where({ user_id: userId })
      .del()

    console.log(`[Push] Removed ${count} subscriptions for deleted user ${userId}`)
  }
}
