import { getUserColor } from '../utils/attributionColors'

interface AttributionStatsProps {
  attributions: Record<string, { userId: number | null; username: string; timestamp: string }>
  clues: { across: { number: number; clue: string }[]; down: { number: number; clue: string }[] } | null
}

export function AttributionStats({ attributions, clues }: AttributionStatsProps) {
  if (!clues) return null

  // Calculate stats per user
  const userStats = new Map<string, { userId: number | null; username: string; count: number }>()

  Object.values(attributions).forEach((attr) => {
    const key = `${attr.userId}-${attr.username}`
    const existing = userStats.get(key)
    if (existing) {
      existing.count++
    } else {
      userStats.set(key, {
        userId: attr.userId,
        username: attr.username,
        count: 1
      })
    }
  })

  const totalClues = clues.across.length + clues.down.length
  const totalAttributed = Object.keys(attributions).length
  const sortedUsers = Array.from(userStats.values()).sort((a, b) => b.count - a.count)

  if (sortedUsers.length === 0) {
    return null
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
      <h3 className="font-bold text-gray-900 mb-3">Statistics</h3>
      
      <div className="mb-4 text-sm text-gray-600">
        <div className="flex justify-between mb-1">
          <span>Completed:</span>
          <span className="font-semibold">{totalAttributed} / {totalClues}</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all"
            style={{ width: `${(totalAttributed / totalClues) * 100}%` }}
          />
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs text-gray-500 mb-2">Clues solved:</p>
        {sortedUsers.map((user) => (
          <div key={`${user.userId}-${user.username}`} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className="w-4 h-4 rounded border-2"
                style={{
                  backgroundColor: getUserColor(user.userId),
                  borderColor: getUserColor(user.userId)
                }}
              />
              <span className="text-sm text-gray-700">{user.username}</span>
            </div>
            <span className="text-sm font-semibold text-gray-900">{user.count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
