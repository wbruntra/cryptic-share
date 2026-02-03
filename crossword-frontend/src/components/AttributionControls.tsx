import { getUserColor } from '../utils/attributionColors'

interface AttributionControlsProps {
  enabled: boolean
  onToggle: () => void
  attributions: Record<string, { userId: number | null; username: string; timestamp: string }>
}

export function AttributionControls({ enabled, onToggle, attributions }: AttributionControlsProps) {
  // Get unique users from attributions
  const users = Object.values(attributions).reduce((acc, attr) => {
    const key = `${attr.userId}-${attr.username}`
    if (!acc.has(key)) {
      acc.set(key, { userId: attr.userId, username: attr.username })
    }
    return acc
  }, new Map<string, { userId: number | null; username: string }>())

  const uniqueUsers = Array.from(users.values())

  return (
    <div className="bg-surface border border-border rounded-lg p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-text">Contributions</h3>
        <button
          onClick={onToggle}
          className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
            enabled
              ? 'bg-primary text-white hover:bg-primary-hover'
              : 'bg-input-bg text-text-secondary hover:bg-border border border-border'
          }`}
        >
          {enabled ? 'Hide' : 'Show'}
        </button>
      </div>

      {enabled && uniqueUsers.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-text-secondary mb-2">Color-coded by contributor:</p>
          {uniqueUsers.map((user) => (
            <div key={`${user.userId}-${user.username}`} className="flex items-center gap-2">
              <div
                className="w-4 h-4 rounded border-2"
                style={{
                  backgroundColor: getUserColor(user.userId),
                  borderColor: getUserColor(user.userId)
                }}
              />
              <span className="text-sm text-text">{user.username}</span>
            </div>
          ))}
        </div>
      )}

      {enabled && uniqueUsers.length === 0 && (
        <p className="text-xs text-text-secondary italic">No contributions yet</p>
      )}
    </div>
  )
}
