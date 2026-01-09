import { useEffect, useRef } from 'react'

interface VirtualKeyboardProps {
  onKeyPress: (key: string) => void
  onDelete: () => void
  onClose: () => void
  isOpen: boolean
}

export function VirtualKeyboard({ onKeyPress, onDelete, onClose, isOpen }: VirtualKeyboardProps) {
  const keyboardRef = useRef<HTMLDivElement | null>(null)

  const rows = [
    ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
    ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
  ]

  useEffect(() => {
    const root = document.documentElement

    const update = () => {
      const height = keyboardRef.current?.offsetHeight
      if (height && height > 0) {
        root.style.setProperty('--virtual-keyboard-height', `${height}px`)
      }
    }

    if (isOpen) {
      update()
      window.addEventListener('resize', update)
      window.visualViewport?.addEventListener('resize', update)
    }

    return () => {
      window.removeEventListener('resize', update)
      window.visualViewport?.removeEventListener('resize', update)
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div
      ref={keyboardRef}
      className="fixed bottom-0 left-0 right-0 bg-gray-200 p-2 z-50 shadow-lg border-t border-gray-300"
      style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
    >
      {/* Header / Close Button */}
      <div className="flex justify-center mb-2">
        <button
          onClick={onClose}
          className="w-full flex justify-center items-center py-1 bg-transparent border-none text-gray-500 active:text-gray-800"
          aria-label="Hide keyboard"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>
      </div>

      <div className="flex flex-col gap-2 max-w-3xl mx-auto">
        {rows.map((row, i) => (
          <div key={i} className="flex justify-center gap-1.5">
            {row.map((key) => (
              <button
                key={key}
                onClick={() => onKeyPress(key)}
                className="
                  flex-1 min-w-[30px] h-11 rounded
                  bg-white shadow-sm border-b border-gray-300
                  text-lg font-medium text-gray-900
                  active:bg-gray-100 active:translate-y-[1px] active:shadow-none
                  transition-all
                "
              >
                {key}
              </button>
            ))}
            {i === 2 && (
              <button
                onClick={onDelete}
                className="
                  flex-1 min-w-[40px] h-11 rounded
                  bg-gray-300 shadow-sm border-b border-gray-400
                  text-gray-900 flex items-center justify-center
                  active:bg-gray-400 active:translate-y-[1px] active:shadow-none
                  transition-all
                "
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"></path>
                  <line x1="18" y1="9" x2="12" y2="15"></line>
                  <line x1="12" y1="9" x2="18" y2="15"></line>
                </svg>
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
