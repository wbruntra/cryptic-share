import type { ReactNode } from 'react'
import { Spinner } from '@/components/Spinner'

interface LoadingStateProps {
  message?: string
  children?: ReactNode
  className?: string
}

export function LoadingState({ message = 'Loading...', children, className = '' }: LoadingStateProps) {
  return (
    <div
      className={`flex items-center justify-center min-h-[50vh] text-text-secondary animate-pulse gap-2 ${className}`}
    >
      {children || <Spinner className="w-5 h-5 border-primary" />}
      {message}
    </div>
  )
}
