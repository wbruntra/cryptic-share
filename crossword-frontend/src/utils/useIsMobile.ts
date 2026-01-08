import { useState, useEffect } from 'react'

const MOBILE_BREAKPOINT = 768
const TABLET_BREAKPOINT = 1024

// Detect if device has touch capability
const isTouchDevice = () => {
  if (typeof window === 'undefined') return false
  return (
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    // @ts-expect-error - legacy msMaxTouchPoints
    navigator.msMaxTouchPoints > 0
  )
}

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false
    const width = window.innerWidth
    const isTouch = isTouchDevice()

    // Show mobile UI if:
    // 1. Screen is smaller than mobile breakpoint (phones), OR
    // 2. Device has touch AND screen is smaller than tablet breakpoint (tablets/iPads)
    return width < MOBILE_BREAKPOINT || (isTouch && width < TABLET_BREAKPOINT)
  })

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth
      const isTouch = isTouchDevice()
      setIsMobile(width < MOBILE_BREAKPOINT || (isTouch && width < TABLET_BREAKPOINT))
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return isMobile
}