import { Router, jsonResponse, HttpError, type Context } from '../http/router'
import { PushService } from '../services/pushService'

export function registerPushRoutes(router: Router) {
  router.get('/api/push/vapid-key', handleGetVapidKey)
  router.post('/api/push/subscribe', handleSubscribe)
  router.post('/api/push/unsubscribe', handleUnsubscribe)
}

/**
 * Get VAPID public key for push notification subscription
 */
function handleGetVapidKey(ctx: Context) {
  const publicKey = PushService.getVapidPublicKey()
  if (publicKey) {
    return jsonResponse({ publicKey })
  } else {
    throw new HttpError(503, { error: 'Push notifications not configured' })
  }
}

/**
 * Subscribe to push notifications
 */
async function handleSubscribe(ctx: Context) {
  const body = ctx.body as any
  const { subscription } = body || {}

  if (!subscription?.endpoint || !subscription?.keys) {
    throw new HttpError(400, { error: 'Missing subscription' })
  }

  try {
    await PushService.saveSubscription(subscription)
    return jsonResponse({ success: true })
  } catch (error) {
    console.error('Push subscribe error:', error)
    throw new HttpError(500, { error: 'Failed to save subscription' })
  }
}

/**
 * Unsubscribe from push notifications
 */
async function handleUnsubscribe(ctx: Context) {
  const body = ctx.body as any
  const { endpoint } = body || {}

  if (!endpoint) {
    throw new HttpError(400, { error: 'Missing endpoint' })
  }

  try {
    await PushService.removeSubscription(endpoint)
    return jsonResponse({ success: true })
  } catch (error) {
    console.error('Push unsubscribe error:', error)
    throw new HttpError(500, { error: 'Failed to remove subscription' })
  }
}
