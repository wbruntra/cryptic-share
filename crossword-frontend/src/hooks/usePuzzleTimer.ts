import { useState, useEffect, useRef } from 'react'

const STORAGE_KEY_PREFIX = 'cryptic_timer_'

export const usePuzzleTimer = (sessionId: string | undefined) => {
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const timerRef = useRef<any>(null)
  const lastUpdateTimeRef = useRef<number>(Date.now())

  useEffect(() => {
    if (!sessionId) return

    const key = `${STORAGE_KEY_PREFIX}${sessionId}`

    // Load initial state
    const loadState = () => {
      try {
        const stored = localStorage.getItem(key)
        if (stored) {
          const { totalSeconds, lastTimestamp } = JSON.parse(stored)
          // Add time elapsed since last close/refresh if reasonable (e.g. < 5 mins? No, user wants accumulated work time, assume pause if closed)
          // Actually, if we want to track "work" time, we should assume closing the tab pauses the timer.
          // So we just load the totalSeconds.
          return totalSeconds || 0
        }
      } catch (e) {
        console.error('Failed to parse timer', e)
      }
      return 0
    }

    setElapsedSeconds(loadState())
    lastUpdateTimeRef.current = Date.now()

    // Start timer
    timerRef.current = setInterval(() => {
      const now = Date.now()
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
