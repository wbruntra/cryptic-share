import { useState, useEffect, useRef } from 'react'

const STORAGE_KEY_PREFIX = 'cryptic_timer_'

export const usePuzzleTimer = (sessionId: string | undefined) => {
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const timerRef = useRef<any>(null)

  // Track last real update to total seconds
  const lastUpdateTimeRef = useRef<number>(Date.now())

  // Track user activity for idle detection
  const lastActivityRef = useRef<number>(Date.now())

  // IDLE THRESHOLD: 60 seconds
  const IDLE_THRESHOLD = 60 * 1000

  useEffect(() => {
    if (!sessionId) return

    const key = `${STORAGE_KEY_PREFIX}${sessionId}`

    // Load initial state
    const loadState = () => {
      try {
        const stored = localStorage.getItem(key)
        if (stored) {
          const { totalSeconds } = JSON.parse(stored)
          // We assume "work" time is only while open, so we don't add diff from lastTimestamp
          return totalSeconds || 0
        }
      } catch (e) {
        console.error('Failed to parse timer', e)
      }
      return 0
    }

    setElapsedSeconds(loadState())
    lastUpdateTimeRef.current = Date.now()
    lastActivityRef.current = Date.now()

    // Activity listeners to reset idle timer
    const handleActivity = () => {
      lastActivityRef.current = Date.now()
    }

    const events = ['mousedown', 'keydown', 'touchstart']
    // Throttle adding listeners? No, the handler is cheap (just assigning a ref)
    // But we might want to throttle the actual assignment if it was heavy.
    // Assigning a number to a ref is extremely cheap.
    events.forEach((event) => window.addEventListener(event, handleActivity))

    // Start timer
    timerRef.current = setInterval(() => {
      const now = Date.now()

      // 1. Check if tab is visible
      if (document.hidden) {
        // If hidden, we don't count time.
        // We just update lastUpdateTimeRef to now so we don't accidentally add a huge chunk later.
        lastUpdateTimeRef.current = now
        return
      }

      // 2. Check for idleness
      if (now - lastActivityRef.current > IDLE_THRESHOLD) {
        // User is idle. Do not count time.
        lastUpdateTimeRef.current = now
        return
      }

      // Calculate delta since last check
      const delta = Math.floor((now - lastUpdateTimeRef.current) / 1000)

      if (delta >= 1) {
        setElapsedSeconds((prev) => {
          const newValue = prev + delta
          // Save to local storage
          localStorage.setItem(
            key,
            JSON.stringify({
              totalSeconds: newValue,
              lastTimestamp: now,
            }),
          )
          return newValue
        })
        lastUpdateTimeRef.current = now
      }
    }, 1000)

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
      events.forEach((event) => window.removeEventListener(event, handleActivity))
    }
  }, [sessionId])

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60

    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
    }
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  return formatTime(elapsedSeconds)
}
