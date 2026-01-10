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
   * Save a push subscription for a session
   */
  static async saveSubscription(sessionId: string, subscription: PushSubscription): Promise<void> {
    const { endpoint, keys } = subscription

    // Upsert: if endpoint exists, update session_id; otherwise insert
    const existing = await db('push_subscriptions').where({ endpoint }).first()

    if (existing) {
      await db('push_subscriptions').where({ endpoint }).update({
        session_id: sessionId,
        p256dh: keys.p256dh,
        auth: keys.auth,
        notified: false,
      })
      console.log(
        `[Push] Updated subscription for user ${endpoint.slice(0, 20)}... session: ${sessionId}`,
      )
    } else {
      await db('push_subscriptions').insert({
        session_id: sessionId,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        notified: false,
      })
      console.log(
        `[Push] Created NEW subscription for user ${endpoint.slice(
          0,
          20,
        )}... session: ${sessionId}`,
      )
    }
  }

  /**
   * Remove a push subscription
   */
  static async removeSubscription(endpoint: string): Promise<void> {
    await db('push_subscriptions').where({ endpoint }).del()
  }

  /**
   * Clear the notified flag for a subscription (called when user reconnects via WebSocket)
   */
  static async clearNotifiedFlag(sessionId: string, endpoint?: string): Promise<void> {
    const query = db('push_subscriptions').where({ session_id: sessionId })
    if (endpoint) {
      query.andWhere({ endpoint })
    }
    await query.update({ notified: false })
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
    const subscriptions = await db('push_subscriptions')
      .where({ session_id: sessionId, notified: false })
      .whereNotIn('endpoint', excludeEndpoints)

    console.log(`[Push] Found ${subscriptions.length} eligible subscriptions`)

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
        await db('push_subscriptions').where({ id: sub.id }).update({ notified: true })

        console.log(`Push notification sent for session ${sessionId}`)
      } catch (error: any) {
        // Handle expired/invalid subscriptions
        if (error.statusCode === 404 || error.statusCode === 410) {
          console.log(`Removing expired subscription: ${sub.endpoint}`)
          await this.removeSubscription(sub.endpoint)
        } else {
          console.error('Push notification error:', error)
        }
      }
    }
  }

  /**
   * Get subscriptions for a session (for checking connected users)
   */
  static async getSessionSubscriptions(sessionId: string) {
    return db('push_subscriptions').where({ session_id: sessionId })
  }
}
