import type { ReactNode } from 'react'

interface ToolbarButtonProps {
  onClick: () => void
  icon: ReactNode
  label: string
  title?: string
  disabled?: boolean
  compact?: boolean
  className?: string
}

export function ToolbarButton({
  onClick,
  icon,
  label,
  title,
  disabled,
  compact = false,
  className = '',
}: ToolbarButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${compact ? 'w-9 h-9' : 'w-10 h-10'} flex items-center justify-center rounded-lg border transition-colors ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
      aria-label={label}
      title={title || label}
    >
      {icon}
    </button>
  )
}
