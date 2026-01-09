import { useEffect, useRef } from 'react'

interface BottomSheetProps {
  isOpen: boolean
  onClose: () => void
  children: React.ReactNode
  title?: string
}

export function BottomSheet({ isOpen, onClose, children, title }: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null)

  // Handle escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  // Prevent body scroll when sheet is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  return (
    <>
      {/* Backdrop */}
      <div
        className={`
                    fixed inset-0 bg-black/50 z-40
                    transition-opacity duration-300
                    ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}
                `}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className={`
                    fixed inset-x-0 bottom-0 z-50
                    bg-surface rounded-t-2xl
                    shadow-[0_-4px_20px_rgba(0,0,0,0.3)]
                    transition-transform duration-300 ease-out
                    ${isOpen ? 'translate-y-0' : 'translate-y-full'}
                `}
                  style={{ height: '70dvh', maxHeight: '70dvh' }}
        role="dialog"
        aria-modal="true"
        aria-label={title || 'Bottom sheet'}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 bg-text-secondary rounded-full opacity-50" aria-hidden="true" />
        </div>

        {/* Header */}
        {title && (
          <div className="px-4 pb-3 border-b border-border">
            <h2 className="text-lg font-semibold text-text m-0">{title}</h2>
          </div>
        )}

        {/* Content */}
        <div className="overflow-y-auto h-full" style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}>
          {children}
        </div>
      </div>
    </>
  )
}
