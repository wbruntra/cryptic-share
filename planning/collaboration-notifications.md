# Collaboration Change Notifications & Highlighting

## Problem Statement

When collaborating on a crossword puzzle in real-time, users need visual feedback when:

1. **Real-time changes**: A collaborator fills in a cell while the user is actively viewing the puzzle
2. **Returning to a puzzle**: The puzzle has changed since the user's last visit

Both scenarios require highlighting the changed cells (light pink) and a **manually dismissible** notification to acknowledge the changes. Dismissing the notification updates localStorage with the current state.

---

## User Flow

### Scenario 1: Real-time Collaboration

1. User A and User B are both viewing the same session
2. User B fills in 17-across with "ANSWER"
3. User A sees:
   - The cells for 17-across immediately update with the new letters
   - These cells are highlighted in **light pink** (`#ffe0e8` or similar)
   - A small toast/banner appears: _"Collaborator made changes"_
4. User A clicks the **dismiss (×) button** on the notification
5. The pink highlights fade away

### Scenario 2: Returning to a Puzzle

1. User closes the puzzle tab
2. A collaborator makes changes while the user is away
3. User opens the puzzle again
4. On load, the system compares the server state to the user's last-known state (stored in localStorage)
5. Any differing cells are highlighted in **light pink**
6. A notification appears: _"Puzzle has changed since your last visit"_
7. User dismisses the notification → highlights clear, **localStorage updated with current state**

---

## Technical Design

### Data Structures

#### New State in `PlaySession.tsx`

```typescript
// Cells that have been changed externally and not yet acknowledged
const [changedCells, setChangedCells] = useState<Set<string>>(new Set())
// e.g., Set("2-5", "2-6", "2-7") for row 2, cols 5-7

// Whether to show the notification banner
const [showChangeNotification, setShowChangeNotification] = useState(false)
```

#### LocalStorage: Last Known State

Extend `sessionManager.ts` to store the last-known answer state:

```typescript
interface LocalSession {
  sessionId: string
  puzzleId: number
  puzzleTitle: string
  lastPlayed: number
  lastKnownState?: string[] // NEW: snapshot of answers at last visit (one string per row)
}
```

---

### Implementation Components

#### 1. Tracking Changed Cells (Real-time)

Modify the `cell_updated` socket handler in `PlaySession.tsx`:

```typescript
socketRef.current.on(
  'cell_updated',
  ({ r, c, value }: { r: number; c: number; value: string }) => {
    setAnswers((prev) => {
      const newAnswers = prev.map((row) => [...row])
      if (newAnswers[r]) {
        newAnswers[r][c] = value
      }
      return newAnswers
    })

    // Mark this cell as changed (from collaborator)
    const cellKey = `${r}-${c}`
    setChangedCells((prev) => new Set(prev).add(cellKey))
    setShowChangeNotification(true)
  },
)
```

#### 2. Detecting Changes on Load

In `fetchSession`, compare server state to stored state:

```typescript
// After loading sessionState from server
const storedSession = getLocalSessionById(sessionId) // New helper function
if (storedSession?.lastKnownState && sessionState) {
  const diffs = findDifferences(storedSession.lastKnownState, sessionState)
  if (diffs.length > 0) {
    setChangedCells(new Set(diffs.map(({ r, c }) => `${r}-${c}`)))
    setShowChangeNotification(true)
  }
}

// Update lastKnownState
saveLocalSession({
  sessionId,
  puzzleId,
  puzzleTitle: title,
  lastPlayed: Date.now(),
  lastKnownState: sessionState,
})
```

Helper function:

```typescript
function findDifferences(oldState: string[][], newState: string[][]): { r: number; c: number }[] {
  const diffs: { r: number; c: number }[] = []
  for (let r = 0; r < newState.length; r++) {
    for (let c = 0; c < newState[r].length; c++) {
      const oldVal = oldState[r]?.[c] ?? ''
      const newVal = newState[r][c] ?? ''
      if (oldVal !== newVal) {
        diffs.push({ r, c })
      }
    }
  }
  return diffs
}
```

#### 3. Grid Highlighting

Modify `CrosswordGrid.tsx` to accept and render changed cells:

```typescript
interface CrosswordGridProps {
  grid: RenderedCell[][]
  mode: Mode
  onCellClick: (r: number, c: number) => void
  changedCells?: Set<string> // NEW
}
```

In the cell rendering logic:

```typescript
const isChanged = changedCells?.has(`${rIndex}-${cIndex}`)

let bgClass = 'bg-surface'
if (isBlack) {
  bgClass = 'bg-black'
} else if (cell.isSelected) {
  bgClass = 'bg-selection'
} else if (isChanged) {
  bgClass = 'bg-pink-100 dark:bg-pink-900/30' // Light pink highlight
} else if (cell.isActiveWord) {
  bgClass = 'bg-active-word'
}
```

#### 4. Notification Component

Create a new component `ChangeNotification.tsx`:

```tsx
interface ChangeNotificationProps {
  show: boolean
  onDismiss: () => void
  message?: string
}

export function ChangeNotification({
  show,
  onDismiss,
  message = 'Collaborator made changes',
}: ChangeNotificationProps) {
  if (!show) return null

  return (
    <div
      className="fixed top-20 left-1/2 -translate-x-1/2 z-50 
                    bg-pink-100 dark:bg-pink-900/80 
                    text-pink-800 dark:text-pink-100
                    px-4 py-2 rounded-lg shadow-lg 
                    flex items-center gap-3
                    animate-slide-down"
    >
      <span className="text-sm font-medium">{message}</span>
      <button
        onClick={onDismiss}
        className="text-pink-600 dark:text-pink-300 hover:text-pink-800 dark:hover:text-white 
                   w-6 h-6 flex items-center justify-center rounded-full 
                   hover:bg-pink-200 dark:hover:bg-pink-800 transition-colors"
        aria-label="Dismiss notification"
      >
        ×
      </button>
    </div>
  )
}
```

#### 5. Dismissal Handler

In `PlaySession.tsx`:

```typescript
const handleDismissChanges = () => {
  setShowChangeNotification(false)
  setChangedCells(new Set()) // Clear all highlights

  // Update lastKnownState to current state
  saveLocalSession({
    sessionId,
    puzzleId,
    puzzleTitle: title,
    lastPlayed: Date.now(),
    lastKnownState: answers,
  })
}
```

---

## CSS Additions

Add to `index.css`:

```css
/* Collaboration highlight colors */
.bg-changed-cell {
  background-color: #ffe0e8; /* Light pink */
}

.dark .bg-changed-cell {
  background-color: rgba(190, 18, 60, 0.2); /* Dark mode pink */
}

/* Slide-down animation for notification */
@keyframes slide-down {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}

.animate-slide-down {
  animation: slide-down 0.2s ease-out;
}
```

---

## File Changes Summary

| File                                                       | Change                                                                                                                |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `crossword-frontend/src/pages/PlaySession.tsx`             | Add `changedCells` and `showChangeNotification` state; modify socket handler; add dismiss handler; pass props to grid |
| `crossword-frontend/src/CrosswordGrid.tsx`                 | Accept `changedCells` prop; apply pink background to changed cells                                                    |
| `crossword-frontend/src/utils/sessionManager.ts`           | Add `lastKnownState` to `LocalSession`; add `getLocalSessionById` helper                                              |
| `crossword-frontend/src/components/ChangeNotification.tsx` | NEW: Dismissible notification component                                                                               |
| `crossword-frontend/src/index.css`                         | Add pink highlight and animation styles                                                                               |

---

## Edge Cases & Considerations

### 1. Own Changes vs Collaborator Changes

- Only highlight cells changed by **others**, not the current user
- The socket handler already differentiates: `cell_updated` is only received from others (socket.to broadcasts exclude sender)

### 2. Rapid Changes

- If collaborator types quickly, multiple cells may be highlighted
- Group notifications (don't spam with "1 change", "2 changes", etc.)
- The current approach shows one notification for all changes

### 3. Large Puzzles

- `Set<string>` for cell tracking is efficient (O(1) lookup)
- No performance concerns expected

### 4. Page Refresh During Active Session

- When user refreshes, compare server state to `lastKnownState`
- If changes exist from **before** they left, highlight them
- Their own unsaved changes would be lost (existing behavior)

### 5. Clearing Cells

- A collaborator clearing a cell (setting to `''`) should also be highlighted
- The diff logic handles this correctly

---

## Future Enhancements

1. **Per-collaborator colors**: Different colored highlights for different users
2. **Cursor visibility**: Show where other collaborators are currently typing
3. **Change history**: "User A filled in 17-across at 2:34 PM"
4. **Conflict resolution**: What happens if two users type in the same cell simultaneously?
5. **Sound notifications**: Optional audio cue for remote changes

---

## Decisions Made

1. **Highlight color**: Light pink (`#ffe0e8`) ✅
2. **Notification position**: Top center
3. **Dismissal behavior**: **Manual dismissal required** - changes are infrequent enough that this won't be a nuisance, and users may not be paying attention
4. **localStorage update**: Dismissing the notification updates `lastKnownState` in localStorage

---

## State Format Optimization (Proposed)

### Current Format: `string[][]`

Each cell is stored as a separate string in a 2D array:

```json
[
  ["H", "", "P", "", "E"],
  ["O", "", "O", "", "R"],
  ["L", "U", "L", "L", "A"]
]
```

### Proposed Format: `string[]`

Each row is a single string, with spaces representing empty cells:

```json
["H P E", "O O R", "LULLA"]
```

### Benefits

- **More compact JSON**: ~60-70% size reduction
- **More readable**: Easy to visualize the grid state
- **Similar access pattern**: `state[r][c]` works for both arrays and strings

### Implications for Code

**Reading cells** (no change needed):

```typescript
const value = state[r][c] // Works for both string[][] and string[]
```

**Writing cells** (requires change - strings are immutable):

```typescript
// OLD: string[][] (mutable)
newAnswers[r][c] = char

// NEW: string[] (immutable strings)
newAnswers[r] = newAnswers[r].substring(0, c) + char + newAnswers[r].substring(c + 1)
```

### Files Affected by Format Change

| File                | Change                                                |
| ------------------- | ----------------------------------------------------- |
| `sessionService.ts` | Update `updateCell` to use string manipulation        |
| `PlaySession.tsx`   | Update answer mutation logic                          |
| `sessionManager.ts` | Update `LocalSession` type                            |
| Database migration  | One-time conversion of existing `state` column values |

### Migration Script

Can use the existing `reformat-session.js` utility logic to convert:

```javascript
function convertToStringArray(state) {
  return state.map((row) => row.map((c) => c || ' ').join(''))
}

function convertFromStringArray(state) {
  return state.map((row) => row.split('').map((c) => (c === ' ' ? '' : c)))
}
```
