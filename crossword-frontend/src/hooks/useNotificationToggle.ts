import { useState } from 'react'
import { usePuzzleNotifications } from './usePuzzleNotifications'

export function useNotificationToggle(sessionId: string | null) {
  const { isSupported, isSubscribed, isLoading, subscribe, unsubscribe } =
    usePuzzleNotifications(sessionId ?? '')
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  const handleNotificationClick = async () => {
    if (isSubscribed) {
      await unsubscribe()
      setToastMessage('Notifications turned off')
    } else {
      await subscribe()
      setToastMessage('Notifications enabled - you will receive alerts when words are claimed')
    }
  }

  return {
    toastMessage,
    setToastMessage,
    handleNotificationClick,
    isSupported,
    isSubscribed,
    isLoading,
  }
}
