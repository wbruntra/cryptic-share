import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'

interface PuzzleNotificationState {
  isSupported: boolean
  isSubscribed: boolean
  isLoading: boolean
  subscribe: () => Promise<void>
  unsubscribe: () => Promise<void>
}

export function usePuzzleNotifications(sessionId: string): PuzzleNotificationState {
  const [isSupported, setIsSupported] = useState(false)
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  // Check support and existing subscription on mount
  useEffect(() => {
    const checkSupport = async () => {
      // Check if push is supported
      const supported =
        'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

      setIsSupported(supported)

      if (!supported || !sessionId) {
        setIsLoading(false)
        return
      }

      try {
        // Check if already subscribed to this session
        const { data } = await axios.get<{ subscribed: boolean }>(`/api/push/subscribed/${sessionId}`)
        setIsSubscribed(data.subscribed)
      } catch (error) {
        console.error('Error checking puzzle notification subscription:', error)
      }

      setIsLoading(false)
    }

    checkSupport()
  }, [sessionId])

  const subscribe = useCallback(async () => {
    if (!isSupported || !sessionId) return

    setIsLoading(true)
    try {
      // Request notification permission
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
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

      // Send subscription to backend for this session
      await axios.post(`/api/push/subscribe/${sessionId}`, {
        subscription: sub.toJSON(),
      })

      setIsSubscribed(true)
    } catch (error) {
      console.error('Error subscribing to puzzle notifications:', error)
    }
    setIsLoading(false)
  }, [isSupported, sessionId])

  const unsubscribe = useCallback(async () => {
    if (!sessionId) return

    setIsLoading(true)
    try {
      // Remove from backend
      await axios.post(`/api/push/unsubscribe/${sessionId}`)

      // Also unsubscribe from push manager to clean up browser side
      const registration = await navigator.serviceWorker.ready
      const existingSub = await registration.pushManager.getSubscription()
      if (existingSub) {
        await existingSub.unsubscribe()
      }

      setIsSubscribed(false)
    } catch (error) {
      console.error('Error unsubscribing from puzzle notifications:', error)
    }
    setIsLoading(false)
  }, [sessionId])

  return {
    isSupported,
    isSubscribed,
    isLoading,
    subscribe,
    unsubscribe,
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
