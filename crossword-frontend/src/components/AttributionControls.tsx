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
    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-gray-900">Contributions</h3>
        <button
          onClick={onToggle}
          className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
            enabled
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          {enabled ? 'Hide' : 'Show'}
        </button>
      </div>

      {enabled && uniqueUsers.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500 mb-2">Color-coded by contributor:</p>
          {uniqueUsers.map((user) => (
            <div key={`${user.userId}-${user.username}`} className="flex items-center gap-2">
              <div
                className="w-4 h-4 rounded border-2"
                style={{
                  backgroundColor: getUserColor(user.userId),
                  borderColor: getUserColor(user.userId)
                }}
              />
              <span className="text-sm text-gray-700">{user.username}</span>
            </div>
          ))}
        </div>
      )}

      {enabled && uniqueUsers.length === 0 && (
        <p className="text-xs text-gray-500 italic">No contributions yet</p>
      )}
    </div>
  )
}
