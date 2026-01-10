import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'

const DISMISSED_KEY = 'push-notification-dismissed'

interface PushNotificationState {
  isSupported: boolean
  isSubscribed: boolean
  isDismissed: boolean
  isLoading: boolean
  subscribe: (sessionId: string) => Promise<void>
  unsubscribe: () => Promise<void>
  dismiss: () => void
  getEndpoint: () => string | null
}

export function usePushNotifications(): PushNotificationState {
  const [isSupported, setIsSupported] = useState(false)
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [isDismissed, setIsDismissed] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [subscription, setSubscription] = useState<PushSubscription | null>(null)

  // Check support and existing subscription on mount
  useEffect(() => {
    const checkSupport = async () => {
      // Check if push is supported
      const supported =
        'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

      setIsSupported(supported)

      // Check if dismissed
      const dismissed = localStorage.getItem(DISMISSED_KEY) === 'true'
      setIsDismissed(dismissed)

      if (!supported) {
        setIsLoading(false)
        return
      }

      try {
        // Check for existing subscription
        const registration = await navigator.serviceWorker.ready
        const existingSub = await registration.pushManager.getSubscription()
        setSubscription(existingSub)
        setIsSubscribed(!!existingSub)
      } catch (error) {
        console.error('Error checking push subscription:', error)
      }

      setIsLoading(false)
    }

    checkSupport()
  }, [])

  const subscribe = useCallback(
    async (sessionId: string) => {
      if (!isSupported) return

      setIsLoading(true)
      try {
        // Request notification permission
        const permission = await Notification.requestPermission()
        if (permission !== 'granted') {
          console.log('Notification permission denied')
          setIsLoading(false)
          return
        }

        // Get VAPID public key from server
        const { data } = await axios.get<{ publicKey: string }>('/api/push/vapid-key')

        // Subscribe to push
        const registration = await navigator.serviceWorker.ready
        const sub = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(data.publicKey),
        })

        // Send subscription to backend
        await axios.post('/api/push/subscribe', {
          sessionId,
          subscription: sub.toJSON(),
        })

        setSubscription(sub)
        setIsSubscribed(true)
      } catch (error) {
        console.error('Error subscribing to push:', error)
      }
      setIsLoading(false)
    },
    [isSupported],
  )

  const unsubscribe = useCallback(async () => {
    if (!subscription) return

    setIsLoading(true)
    try {
      // Unsubscribe from push manager
      await subscription.unsubscribe()

      // Remove from backend
      await axios.post('/api/push/unsubscribe', {
        endpoint: subscription.endpoint,
      })

      setSubscription(null)
      setIsSubscribed(false)
    } catch (error) {
      console.error('Error unsubscribing from push:', error)
    }
    setIsLoading(false)
  }, [subscription])

  const dismiss = useCallback(() => {
    localStorage.setItem(DISMISSED_KEY, 'true')
    setIsDismissed(true)
  }, [])

  const getEndpoint = useCallback(() => {
    return subscription?.endpoint || null
  }, [subscription])

  return {
    isSupported,
    isSubscribed,
    isDismissed,
    isLoading,
    subscribe,
    unsubscribe,
    dismiss,
    getEndpoint,
  }
}

// Convert base64 VAPID key to Uint8Array
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray as Uint8Array<ArrayBuffer>
}
