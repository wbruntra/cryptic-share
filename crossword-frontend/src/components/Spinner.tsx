interface SpinnerProps {
  className?: string
}

export function Spinner({ className = '' }: SpinnerProps) {
  return (
    <div
      className={`w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin ${className}`}
    />
  )
}
