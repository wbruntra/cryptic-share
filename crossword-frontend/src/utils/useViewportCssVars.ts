import { useEffect } from 'react'

function getViewportSize() {
  const visualViewport = window.visualViewport
  return {
    width: visualViewport?.width ?? window.innerWidth,
    height: visualViewport?.height ?? window.innerHeight,
  }
}

export function useViewportCssVars() {
  useEffect(() => {
    if (typeof window === 'undefined') return

    const update = () => {
      const { width, height } = getViewportSize()
      const root = document.documentElement
      root.style.setProperty('--app-height', `${Math.round(height)}px`)
      root.style.setProperty('--app-width', `${Math.round(width)}px`)
    }

    update()

    const visualViewport = window.visualViewport
    visualViewport?.addEventListener('resize', update)
    visualViewport?.addEventListener('scroll', update)

    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)

    return () => {
      visualViewport?.removeEventListener('resize', update)
      visualViewport?.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
    }
  }, [])
}
