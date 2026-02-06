import { Router } from 'express'
import { PushService } from '../services/pushService'

const router = Router()

/**
 * Get VAPID public key for push notification subscription
 */
router.get('/vapid-key', (_req, res) => {
  const publicKey = PushService.getVapidPublicKey()
  if (publicKey) {
    res.json({ publicKey })
  } else {
    res.status(503).json({ error: 'Push notifications not configured' })
  }
})

/**
 * Subscribe to push notifications
 */
router.post('/subscribe', async (req, res) => {
  const { subscription } = req.body

  if (!subscription?.endpoint || !subscription?.keys) {
    return res.status(400).json({ error: 'Missing subscription' })
  }

  try {
    await PushService.saveSubscription(subscription)
    res.json({ success: true })
  } catch (error) {
    console.error('Push subscribe error:', error)
    res.status(500).json({ error: 'Failed to save subscription' })
  }
})

/**
 * Unsubscribe from push notifications
 */
router.post('/unsubscribe', async (req, res) => {
  const { endpoint } = req.body

  if (!endpoint) {
    return res.status(400).json({ error: 'Missing endpoint' })
  }

  try {
    await PushService.removeSubscription(endpoint)
    res.json({ success: true })
  } catch (error) {
    console.error('Push unsubscribe error:', error)
    res.status(500).json({ error: 'Failed to remove subscription' })
  }
})

export default router
