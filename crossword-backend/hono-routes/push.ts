import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { AuthUser } from '../hono-middleware/auth'
import { PushService } from '../services/pushService'

type Variables = { user: AuthUser | null }

const push = new Hono<{ Variables: Variables }>()

// GET /api/push/vapid-key
push.get('/vapid-key', (c) => {
  const publicKey = PushService.getVapidPublicKey()
  if (publicKey) {
    return c.json({ publicKey })
  } else {
    throw new HTTPException(503, { message: 'Push notifications not configured' })
  }
})

// POST /api/push/subscribe
push.post('/subscribe', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const { subscription } = body

  if (!subscription?.endpoint || !subscription?.keys) {
    throw new HTTPException(400, { message: 'Missing subscription' })
  }

  try {
    await PushService.saveSubscription(subscription)
    return c.json({ success: true })
  } catch (error) {
    console.error('Push subscribe error:', error)
    throw new HTTPException(500, { message: 'Failed to save subscription' })
  }
})

// POST /api/push/unsubscribe
push.post('/unsubscribe', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const { endpoint } = body

  if (!endpoint) {
    throw new HTTPException(400, { message: 'Missing endpoint' })
  }

  try {
    await PushService.removeSubscription(endpoint)
    return c.json({ success: true })
  } catch (error) {
    console.error('Push unsubscribe error:', error)
    throw new HTTPException(500, { message: 'Failed to remove subscription' })
  }
})

export { push }
