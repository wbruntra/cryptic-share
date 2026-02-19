import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { AuthUser } from '../hono-middleware/auth'
import { requireAuth } from '../hono-middleware/auth'
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

// GET /api/push/subscribed/:sessionId - Check if user is subscribed to session
push.get('/subscribed/:sessionId', async (c) => {
  const user = requireAuth(c)
  const sessionId = c.req.param('sessionId')

  try {
    const isSubscribed = await PushService.isSubscribed(sessionId, user.id as number)
    return c.json({ subscribed: isSubscribed })
  } catch (error) {
    console.error('Push subscription check error:', error)
    throw new HTTPException(500, { message: 'Failed to check subscription status' })
  }
})

// POST /api/push/subscribe/:sessionId - Subscribe to session notifications
push.post('/subscribe/:sessionId', async (c) => {
  const user = requireAuth(c)
  const sessionId = c.req.param('sessionId')
  const body = await c.req.json().catch(() => ({}))
  const { subscription } = body

  if (!subscription?.endpoint || !subscription?.keys) {
    throw new HTTPException(400, { message: 'Missing subscription data' })
  }

  try {
    await PushService.subscribeToSession(sessionId, user.id as number, subscription)
    return c.json({ success: true })
  } catch (error) {
    console.error('Push subscribe error:', error)
    throw new HTTPException(500, { message: 'Failed to save subscription' })
  }
})

// POST /api/push/unsubscribe/:sessionId - Unsubscribe from session notifications
push.post('/unsubscribe/:sessionId', async (c) => {
  const user = requireAuth(c)
  const sessionId = c.req.param('sessionId')

  try {
    await PushService.unsubscribeFromSession(sessionId, user.id as number)
    return c.json({ success: true })
  } catch (error) {
    console.error('Push unsubscribe error:', error)
    throw new HTTPException(500, { message: 'Failed to remove subscription' })
  }
})

export { push }
