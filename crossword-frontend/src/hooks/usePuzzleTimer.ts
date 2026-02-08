import { useEffect, useRef, useState } from 'react'

const STORAGE_KEY_PREFIX = 'cryptic_timer_'
const IDLE_THRESHOLD = 60 * 1000

const loadStoredSeconds = (key: string) => {
  try {
    const stored = localStorage.getItem(key)
    if (stored) {
      const { totalSeconds } = JSON.parse(stored)
      return totalSeconds || 0
    }
  } catch (error) {
    console.error('Failed to parse timer', error)
  }
  return 0
}

export const formatTimerTime = (seconds: number) => {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

export const usePuzzleTimer = (sessionId: string | undefined): { timerDisplay: string } => {
  const [timerSeconds, setTimerSeconds] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Track last real update to total seconds
  const lastUpdateTimeRef = useRef<number>(0)

  // Track user activity for idle detection
  const lastActivityRef = useRef<number>(0)

  useEffect(() => {
    if (!sessionId) return

    const key = `${STORAGE_KEY_PREFIX}${sessionId}`

    // Load initial time
    const initialSeconds = loadStoredSeconds(key)
    setTimerSeconds(initialSeconds)

    lastUpdateTimeRef.current = Date.now()
    lastActivityRef.current = Date.now()

    // Activity listeners to reset idle timer
    const handleActivity = () => {
      lastActivityRef.current = Date.now()
    }

    const events = ['mousedown', 'keydown', 'touchstart']
    events.forEach((event) => window.addEventListener(event, handleActivity))

    // Start timer
    timerRef.current = setInterval(() => {
      const now = Date.now()

      // 1. Check if tab is visible
      if (document.hidden) {
        lastUpdateTimeRef.current = now
        return
      }

      // 2. Check for idleness
      if (now - lastActivityRef.current > IDLE_THRESHOLD) {
        lastUpdateTimeRef.current = now
        return
      }

      // Calculate delta since last check
      const delta = Math.floor((now - lastUpdateTimeRef.current) / 1000)

      if (delta >= 1) {
        const currentStored = loadStoredSeconds(key)
        const newValue = currentStored + delta

        localStorage.setItem(
          key,
          JSON.stringify({
            totalSeconds: newValue,
            lastTimestamp: now,
          }),
        )

        setTimerSeconds(newValue)
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

  return { timerDisplay: formatTimerTime(timerSeconds) }
}
