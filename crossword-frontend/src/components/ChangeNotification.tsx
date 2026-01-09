import React from 'react'

interface ChangeNotificationProps {
  show: boolean
  onDismiss: () => void
  message?: string
}

export function ChangeNotification({
  show,
  onDismiss,
  message = 'Partner made changes',
}: ChangeNotificationProps) {
  if (!show) return null

  return (
    <div
      className="fixed top-20 left-1/2 -translate-x-1/2 z-50 
                    bg-pink-100 dark:bg-pink-900/80 
                    text-pink-800 dark:text-pink-100
                    px-4 py-2 rounded-lg shadow-lg 
                    flex items-center gap-3
                    animate-slide-down border border-pink-200 dark:border-pink-800/50"
    >
      <span className="text-sm font-medium">{message}</span>
      <button
        onClick={onDismiss}
        className="text-pink-600 dark:text-pink-300 hover:text-pink-800 dark:hover:text-white 
                   w-6 h-6 flex items-center justify-center rounded-full 
                   hover:bg-pink-200 dark:hover:bg-pink-800 transition-colors"
        aria-label="Dismiss notification"
      >
        ×
      </button>
    </div>
  )
}
