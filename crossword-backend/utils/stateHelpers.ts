export // Set a character at position in a row string
function setCharAt(str: string, index: number, char: string): string {
  // Ensure the string is long enough, pad with spaces if needed
  let paddedStr = str
  if (paddedStr.length <= index) {
    paddedStr = paddedStr.padEnd(index + 1, ' ')
  }
  return paddedStr.substring(0, index) + char + paddedStr.substring(index + 1)
}

// Get a character (handling undefined/out of bounds)
export function getCharAt(state: string[] | undefined, r: number, c: number): string {
  if (!state || !state[r]) return ''
  return state[r][c] === ' ' ? '' : state[r][c] ?? ''
}

// Initialize empty state for a grid
export function createEmptyState(height: number, width: number): string[] {
  return Array(height).fill(' '.repeat(width))
}

// Convert from legacy format if needed
export function migrateLegacyState(state: unknown): string[] {
  if (!Array.isArray(state)) return []
  if (state.length === 0) return []

  // Check if it's already string[] format (first element is string and likely has length > 1 or is empty string/single char which is ambiguous but safer to treat as string)
  // Actually, simpler check: check type of first element
  if (typeof state[0] === 'string') {
    // If it's a 1D array of strings, we assume it's the new format or empty strings
    return state as string[]
  }

  // Convert from string[][] format
  if (Array.isArray(state[0])) {
    return (state as string[][]).map((row) => row.map((c) => c || ' ').join(''))
  }

  return []
}

/**
 * Calculate the number of fillable cells (W and N) in a grid.
 * Grid format: "W B N\nW W B" (space-separated cells, newline-separated rows)
 */
export function calculateLetterCount(grid: string): number {
  const rows = grid.split('\n').map((row) => row.trim().split(' '))
  let count = 0
  for (const row of rows) {
    for (const cell of row) {
      if (cell === 'W' || cell === 'N') {
        count++
      }
    }
  }
  return count
}

/**
 * Count the number of non-empty letters in a session state.
 * State format: string[] where each string is a row, spaces are empty cells.
 */
export function countFilledLetters(state: string[]): number {
  let count = 0
  for (const row of state) {
    for (const char of row) {
      if (char !== ' ' && char !== '') {
        count++
      }
    }
  }
  return count
}

/**
 * Merge one state array on top of a base state array. Non-space cells in
 * `overlayState` win; everything else keeps the base value.
 */
export function mergeStates(baseState: string[], overlayState: string[]): string[] {
  const mergedState = [...baseState]
  if (overlayState.length === 0) return mergedState

  if (mergedState.length === 0) {
    mergedState.push(...overlayState)
    return mergedState
  }

  for (let r = 0; r < overlayState.length; r++) {
    const overlayRow = overlayState[r]
    if (!overlayRow) continue

    if (!mergedState[r]) mergedState[r] = ''
    for (let c = 0; c < overlayRow.length; c++) {
      const overlayChar = overlayRow[c]
      if (overlayChar && overlayChar.trim() !== '') {
        mergedState[r] = setCharAt(mergedState[r], c, overlayChar as string)
      }
    }
  }

  return mergedState
}

/**
 * True if a session has no filled letters and no attributions - i.e. nobody
 * has actually done anything in it yet, so it's safe to discard.
 */
export function isSessionUntouched(stateJson: string, attributionsJson: string | null | undefined): boolean {
  let filled = 0
  try {
    filled = countFilledLetters(migrateLegacyState(JSON.parse(stateJson || '[]')))
  } catch {
    // Treat unparseable state as untouched
  }

  let attrCount = 0
  try {
    attrCount = Object.keys(JSON.parse(attributionsJson || '{}')).length
  } catch {
    // ignore
  }

  return filled === 0 && attrCount === 0
}
