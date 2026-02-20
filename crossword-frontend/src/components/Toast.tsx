import React, { useEffect, useRef } from 'react'

interface ToastProps {
  show: boolean
  message: string
  onDismiss: () => void
  duration?: number
}

export function Toast({ show, message, onDismiss, duration = 2000 }: ToastProps) {
  const onDismissRef = useRef(onDismiss)

  useEffect(() => {
    onDismissRef.current = onDismiss
  }, [onDismiss])

  useEffect(() => {
    if (show) {
      const timer = setTimeout(() => {
        onDismissRef.current()
      }, duration)

      return () => clearTimeout(timer)
    }
  }, [show, duration])

  if (!show) return null

  return (
    <div
      className="fixed top-20 left-1/2 -translate-x-1/2 z-50 
                 bg-surface text-text px-4 py-3 rounded-lg shadow-xl 
                 flex items-center gap-2 border border-border
                 animate-slide-down"
    >
      <span className="text-sm font-medium">{message}</span>
    </div>
  )
}
