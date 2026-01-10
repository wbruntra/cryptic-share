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

export class PushService {
  /**
   * Get VAPID public key for frontend subscription
   */
  static getVapidPublicKey(): string | undefined {
    return vapidPublicKey
  }

  /**
   * Save a GLOBAL push subscription (device registration only)
   */
  static async saveSubscription(subscription: PushSubscription): Promise<void> {
    const { endpoint, keys } = subscription

    // Upsert global subscription
    const existing = await db('push_subscriptions').where({ endpoint }).first()

    if (existing) {
      await db('push_subscriptions').where({ endpoint }).update({
        p256dh: keys.p256dh,
        auth: keys.auth,
      })
      console.log(`[Push] Updated global subscription for ${endpoint.slice(0, 20)}...`)
    } else {
      await db('push_subscriptions').insert({
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
      })
      console.log(`[Push] Created NEW global subscription for ${endpoint.slice(0, 20)}...`)
    }
  }

  /**
   * Link an endpoint to a session (subscribe to updates for THIS puzzle)
   */
  static async linkSession(sessionId: string, endpoint: string): Promise<void> {
    // Only link if the global subscription exists (safety check)
    const sub = await db('push_subscriptions').where({ endpoint }).first()
    if (!sub) {
      console.warn(`[Push] Cannot link session ${sessionId}: Endpoint not found globally`)
      return
    }

    // Upsert session link
    // We use ON CONFLICT DO UPDATE (or ignore) logic via application code for broad compatibility
    const existingLink = await db('session_subscriptions')
      .where({ session_id: sessionId, endpoint })
      .first()

    if (!existingLink) {
      await db('session_subscriptions').insert({
        session_id: sessionId,
        endpoint,
        notified: false,
      })
      console.log(`[Push] Linked endpoint to session ${sessionId}`)
    } else {
      // Ensure notified is false so they get updates again if they re-join
      await db('session_subscriptions')
        .where({ session_id: sessionId, endpoint })
        .update({ notified: false })
    }
  }

  /**
   * Remove a push subscription globally
   */
  static async removeSubscription(endpoint: string): Promise<void> {
    await db('push_subscriptions').where({ endpoint }).del()
    // Cascade delete handles session_subscriptions usually, but let's be safe
    await db('session_subscriptions').where({ endpoint }).del()
  }

  /**
   * Clear the notified flag for a subscription (called when user reconnects via WebSocket)
   */
  static async clearNotifiedFlag(sessionId: string, endpoint: string): Promise<void> {
    await db('session_subscriptions')
      .where({ session_id: sessionId, endpoint })
      .update({ notified: false })
  }

  /**
   * Notify all participants of a session who haven't been notified yet.
   * Only sends ONE notification per subscription until they reconnect.
   */
  static async notifySessionParticipants(
    sessionId: string,
    puzzleTitle: string,
    excludeEndpoints: string[] = [],
  ): Promise<void> {
    if (!vapidPublicKey || !vapidPrivateKey) {
      console.warn('[Push] Push notifications not configured (missing VAPID keys)')
      return
    }

    console.log(
      `[Push] Looking for subscriptions for session ${sessionId}, excluding [${excludeEndpoints.length}] endpoints`,
    )

    // Get all subscriptions for this session that haven't been notified
    // Join with global push_subscriptions to get keys
    const subscriptions = await db('session_subscriptions')
      .join('push_subscriptions', 'session_subscriptions.endpoint', 'push_subscriptions.endpoint')
      .where('session_subscriptions.session_id', sessionId)
      .where('session_subscriptions.notified', false)
      .whereNotIn('session_subscriptions.endpoint', excludeEndpoints)
      .select(
        'session_subscriptions.id as link_id',
        'push_subscriptions.endpoint',
        'push_subscriptions.p256dh',
        'push_subscriptions.auth',
      )

    console.log(
      `[Push] Found ${subscriptions.length} eligible subscriptions for session ${sessionId}`,
    )

    if (subscriptions.length === 0) {
      return
    }

    const payload = JSON.stringify({
      title: 'Puzzle Updated',
      body: `Someone made changes to "${puzzleTitle}"`,
      url: `/play/${sessionId}`,
    })

    // Send notifications and mark as notified
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

        // Mark as notified so we don't send again until reconnect
        await db('session_subscriptions').where({ id: sub.link_id }).update({ notified: true })

        console.log(`[Push] Notification sent to ${sub.endpoint.slice(0, 20)}...`)
      } catch (error: any) {
        // Handle expired/invalid subscriptions
        if (error.statusCode === 404 || error.statusCode === 410) {
          console.log(`[Push] Removing expired subscription: ${sub.endpoint}`)
          await this.removeSubscription(sub.endpoint)
        } else {
          console.error('[Push] Notification error:', error)
        }
      }
    }
  }

  /**
   * Get subscriptions for a session (for checking connected users)
   */
  static async getSessionSubscriptions(sessionId: string) {
    return db('session_subscriptions').where({ session_id: sessionId })
  }
}
