interface SkeletonProps {
  className?: string
  style?: React.CSSProperties
}

export function SkeletonLoader({ className = '', style = {} }: SkeletonProps) {
  return <div className={`animate-pulse bg-border rounded ${className}`} style={style} />
}

export function SkeletonPuzzleCard() {
  return (
    <div className="bg-surface rounded-xl p-6 border border-border shadow-md h-[180px] flex flex-col justify-between">
      <div>
        <SkeletonLoader className="h-6 w-3/4 mb-4" />
        <SkeletonLoader className="h-4 w-1/2" />
      </div>
      <div className="flex gap-3">
        <SkeletonLoader className="h-10 w-24 rounded-lg" />
        <SkeletonLoader className="h-10 w-24 rounded-lg" />
      </div>
    </div>
  )
}
