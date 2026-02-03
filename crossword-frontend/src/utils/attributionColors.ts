// Predefined color palette for user attributions
const ATTRIBUTION_COLORS = [
  '#3B82F6', // blue
  '#10B981', // green
  '#F59E0B', // amber
  '#EF4444', // red
  '#8B5CF6', // purple
  '#EC4899', // pink
  '#14B8A6', // teal
  '#F97316', // orange
]

// Map userId to a consistent color
const userColorMap = new Map<number | null, string>()
let nextColorIndex = 0

export function getUserColor(userId: number | null): string {
  // Anonymous users (null userId) get a default gray color
  if (userId === null) {
    return '#6B7280' // gray
  }

  if (userColorMap.has(userId)) {
    return userColorMap.get(userId)!
  }

  const color = ATTRIBUTION_COLORS[nextColorIndex % ATTRIBUTION_COLORS.length]
  userColorMap.set(userId, color)
  nextColorIndex++

  return color
}

// Get background color with opacity for cell highlighting
export function getAttributionBackground(userId: number | null): string {
  const color = getUserColor(userId)
  return `${color}20` // 20 = ~12% opacity in hex
}

// Get border color for cell highlighting
export function getAttributionBorder(userId: number | null): string {
  const color = getUserColor(userId)
  return `${color}80` // 80 = 50% opacity in hex
}

// Reset color assignments (useful for testing or switching sessions)
export function resetColorAssignments(): void {
  userColorMap.clear()
  nextColorIndex = 0
}
