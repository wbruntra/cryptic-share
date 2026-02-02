# Auto-Check Feature Implementation Plan

## Overview
Implement automatic answer checking that flashes green when a word is completed correctly, and red when incorrect. This happens immediately upon completing a word (filling in the last letter).

## Key Design Decisions

### 1. **Single-Word Check Function** (`answerChecker.ts`)
New function: `checkSingleWord(grid, sessionState, puzzleAnswers, clueNumber, direction)`
- Locates word by clue number and direction using existing `extractClueMetadata`
- Extracts user answer using existing `extractWord`
- Returns null if word is incomplete (contains spaces)
- Returns `CheckResult` with `isCorrect`, `cells` array, and answers

### 2. **State Management** (`PlaySession.tsx`)
New state variables:
- `autoCheckEnabled: boolean` (hardcoded `true`, ready for future config)
- `checkedWords: Set<string>` - Tracks words already auto-checked (format: `"5-across"`)
- `correctFlashCells: Set<string>` - Cells currently flashing green
- `incorrectFlashCells: Set<string>` - Cells currently flashing red
- Refs for timeout IDs to clear flashes after 1 second

### 3. **Auto-Check Trigger**
Called after every cell update (keyboard or virtual keyboard):
1. Check if the modified cell is in the current cursor's word
2. Extract the current word's answer
3. If complete AND not in `checkedWords`:
   - Run `checkSingleWord`
   - Add cells to appropriate flash set
   - Set 1-second timeout to clear flash
   - Add word ID to `checkedWords`

### 4. **Reset Mechanism**
Words are removed from `checkedWords` when:
- User edits any cell in that word (via `useEffect` watching `answers`)
- User clicks "Clear Highlights" button
- User clicks "Check Answers" button (manual check resets all)

### 5. **Visual Feedback** (`CrosswordGrid.tsx`)
New props:
- `correctFlashCells?: Set<string>`
- `incorrectFlashCells?: Set<string>`

CSS classes (using Tailwind built-in utilities):
- **Duration:** 600ms (brief flash)
- **Correct:** `bg-green-500 dark:bg-green-600 text-white`
- **Incorrect:** `bg-red-500 dark:bg-red-600 text-white`
- **Animation:** Use `animate-pulse` utility for brief visibility

The flash is implemented by conditionally applying the color classes when a cell is in the flash set. A `useEffect` timer in `PlaySession.tsx` clears the flash sets after 600ms, causing the cells to transition back to their normal state.

### 6. **Priority of Visual States**
When multiple states apply to a cell:
1. Selected cell (yellow) - highest priority
2. Flash feedback (green/red) - temporary, shown for 1 second
3. Error state (yellow background) - persistent from manual check
4. Changed cells (blue tint) - from collaborators
5. Active word (light blue) - current word being edited
6. Default (white)

## Implementation Steps

1. **Create `checkSingleWord` function** in `answerChecker.ts`
2. **Add flash state and `checkedWords` tracking** in `PlaySession.tsx`
3. **Create `autoCheckCurrentWord` function** that checks completion and triggers flash
4. **Integrate auto-check** into keyboard handlers and cell update logic
5. **Add reset logic** when words are edited after completion
6. **Update `CrosswordGrid`** to accept and display flash props
7. **Test thoroughly** with various scenarios:
   - Complete word correctly → green flash
   - Complete word incorrectly → red flash
   - Edit after completion → re-checks on next completion
   - Switch direction mid-word → only checks active direction

## Files to Modify
- `crossword-frontend/src/utils/answerChecker.ts` - Add single-word check
- `crossword-frontend/src/pages/PlaySession.tsx` - Add state, logic, and integration
- `crossword-frontend/src/CrosswordGrid.tsx` - Add visual feedback

## Configuration for Future
The `autoCheckEnabled` flag is ready to be:
- Added to user preferences/localStorage
- Exposed in a settings UI
- Passed as a prop or context value

When disabled, all auto-check logic is bypassed, but `checkedWords` tracking still works to prevent duplicate manual check flashes.
