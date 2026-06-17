# Napkin

## Corrections

| Date | Source | What Went Wrong | What To Do Instead |
| ---- | ------ | --------------- | ------------------ |
| 2026-06-17 | user + code review | HomePage showed 99% for a fully-filled session; play page showed complete. Two root causes: (1) `getUserAndFriendsSessions` read stale DB state while `getSessionWithPuzzle` returned newer in-memory cache state; (2) `countTotalCells` counted any non-'B' cell, so a trailing newline in `puzzles.grid` made the denominator one larger than `calculateLetterCount`/`letter_count`. Puzzle creation/update also did not trim grid strings, allowing trailing newlines to be persisted. | Use cached state (when present) in `getUserAndFriendsSessions`, derive completion from `puzzles.letter_count`, make `countTotalCells` count only 'W'/'N' cells to match `calculateLetterCount`, and trim `grid` in `PuzzleService.createPuzzle`/`updatePuzzle`. |

## User Preferences

- When (re)generating explanations, do NOT feed prior/unverified explanations back to the LLM as context — they can anchor it on bad logic. Provide only clue + answer.
- The cryptic explainer model is `gpt-5-mini` via the Responses API (`utils/openai.ts` → `buildExplanationRequestBody` / `explainCrypticClue`). Do not swap models.
- Punctuation is never part of an answer; the explainer must strip ALL punctuation from clue_segmentation tokens (no punctuation-only tokens, including "?").

## Patterns That Work

- **Deterministic Parsewords skeletons from explanations**: `utils/parsewordsSkeleton.ts` (`buildSkeletonFromExplanation`) turns a verified wordplay/&lit explanation into a one-correct-path Parsewords puzzle; `utils/parsewordsSolver.ts` (`validatePuzzle`, shared BFS) confirms solvability. No LLM needed for the skeleton — LLM only adds red herrings later.
- Explainer `operation` is a fixed enum (synonym, abbreviate, literal, translation, anagram, reversal, trim, delete, concatenate, container, hidden, homophone, initials) in `utils/crypticSchema.ts` (Zod + AJV + instructions all must stay in sync).
- Skeleton builder promotes any never-consumed indicator token to role `link` so the BFS win check (exactly one non-definition/non-link token == answer) isn't blocked.

## Patterns That Don't Work

- **Non-atomic explanation steps break skeleton generation.** Containers/concatenate/delete must operate on already-resolved UPPERCASE letter strings — if the explainer folds a synonym/abbreviation into the same step (e.g. `"HOUS to entertain king"` container without first `king→R`), the BFS inserts the raw word and fails. Fix was strengthening the explainer instructions to require ONE atomic operation per step.
- BUT don't over-correct into forcing a step for EVERY word. A word used literally (its own letters == contribution, e.g. "Do"→DO) needs NO step — fold it directly into the combining concatenate/charade step (which also drops link words like "by"/"and"). Only synonyms, abbreviations, and symbol/number spell-outs (3→THREE) need their own resolution step. No-op `literal` steps that just uppercase a word are wrong.
- `trim` (compute trim-first/trim-last) only removes the FIRST or LAST letter. Interior/substring removal (THREE−H→TREE, SUPERMODEL−MOD→SUPEREL) needs the `delete` op → mapped to a `result` trigger (explicit answer) since it can't be mechanically derived.

## Domain Notes

- Parsewords win check lives in `crossword-frontend/src/components/parsewords/ParsewordsGame.tsx` — must use `normalize()` (strips spaces/punct) to compare to `puzzle.answer`, else multi-word answers like ROCKET SCIENTIST never register a win.
- Frontend & backend both define `CrypticType` + trigger types; keep `crossword-frontend/.../parsewords/types.ts` and `crossword-backend/utils/parsewordsGenerator.ts` in sync (e.g. the `deletion` label was added to both).
- `clue_explanations` table has NO `updated_at` column (only created_at/verified/verified_at). `parsewords_puzzles` DOES have updated_at.
- Admin test page for skeletons: http://crossword.localhost:1355/admin/parsewords?puzzle=3

## Recent Work Log

### 2026-02-19 - Push Notifications Rebuild

**Goal**: Simplify push notifications to trigger only on word claims, with 20-min rate limiting

**Completed**:

1. Created `session_push_subscriptions` table with per-session, per-user subscriptions
2. Dropped old `push_subscriptions` and `session_subscriptions` tables
3. Rewrote `PushService` with simpler API:
   - `subscribeToSession(sessionId, userId, subscription)`
   - `unsubscribeFromSession(sessionId, userId)`
   - `notifyOnWordClaim(sessionId, puzzleTitle, claimingUserId)` - with 20-min cooldown
4. Updated push routes to be session-specific with auth required
5. Modified word claim endpoint to trigger push notifications
6. Added notification bell to DesktopView and MobileView headers
7. Created `usePuzzleNotifications` hook for frontend subscription management

**Key Design Decisions**:

- Per-session subscriptions (not global) - user subscribes to each puzzle they want notifications for
- 20-minute rate limit per subscription - prevents spam when multiple words are claimed quickly
- Excludes the claiming user from notifications - they don't need to be notified of their own action
- Requires authentication to subscribe - anonymous users can't get push notifications
- Uses standard Web Push API with endpoint, p256dh, and auth keys

### 2026-02-20 - Notification Toast Fix

**Goal**: Fix notification bell toast never disappearing.
**What Went Wrong**: The `Toast` component included `onDismiss` in its `setTimeout` `useEffect` dependency array. The parent components (`DesktopView` and `MobileView`) trigger a state update every second because of `usePuzzleTimer`, passing down a newly-created inline `onDismiss` function. This caused the 2000ms dismiss timeout to clear and reset every 1000ms, effectively making the toast last forever.
**What To Do Instead**: When a component receives a callback prop and uses it inside a timeout or interval, either the parent must memoize the callback with `useCallback`, or the child component must use a `useRef` to store the latest callback without triggering the effect to re-run. In this codebase, the latter is safer to implement for isolated components like `Toast`.

### 2026-05-31 - Improved Clue Explanation Quality with Token Role Segmentation

**Goal**: Improve cryptic clue explanation quality by systematically segmenting clue words and identifying their structural roles early.

**Completed**:
1. Added `clue_segmentation` field to Zod and AJV schemas for all explanation types.
2. Updated prompt instructions (`crypticInstructions` in `crypticSchema.ts`) to:
   - Perform word-by-word token segmentation of the entire clue verbatim first.
   - Assign exact roles to all tokens: `definition`, `wordplay`, `indicator`, or `link` (filler words like "for", "and", "can be").
   - Strictly prevent consuming `definition` or `link` words in wordplay steps. They must remain completely untouched in the `clue_after` state.
3. Updated backend TS types and schema tests to ensure backwards compatibility and validation conformance.
4. Added visual "Clue Analysis & Word Roles" token breakdown in `ClueExplanationDisplay` to display word roles in color-coded pills.

### 2026-06-01 - Session Puzzle Fill-in Reliability Fix

**Goal**: Fix the race condition causing unreliable and partial letter fills during automated whole-word puzzle fill-ins.

**Completed**:
1. **Identified Race Condition**: Discovered that when multiple cell updates were fired concurrently (e.g. cell-by-cell in a loop on the client side), they caused the backend's async cache-load operations and grid-initialization DB queries to execute in parallel. The last one to resolve would overwrite the cache with its loaded state, wiping out updates from all other concurrent requests.
2. **Concurrent Loading Cache Fix (Backend)**: Added `pendingLoads` promise cache map in `SessionService.getCachedOrLoad` to resolve all parallel loads of the same session to the exact same shared promise, resulting in a single memory cache reference.
3. **Synchronized Grid Initialization (Backend)**: Added `pendingInits` promise cache map in `SessionService` to synchronize asynchronous puzzle grid dimensions fetching and initialization, ensuring parallel first-edit cell updates do not overwrite each other's state array references.
4. **Bulk Cells Update Support (Backend)**: Added a new `POST /api/sessions/:sessionId/cells` endpoint and `updateCells` method in `SessionService` to process and broadcast multiple cell changes in a single tick.
5. **Real-time Hint Broadcasts (Backend)**: Upgraded `POST /api/sessions/:sessionId/hint` (both single cell and word reveals) to use `updateCells` and broadcast real-time SSE events so all collaborative session users see hint reveals instantly.
6. **Frontend Integration**: Updated `usePuzzleSync` hook to expose `sendCellsUpdate` and updated `PlaySession.tsx`'s `handleFillAnswer` to perform the entire word fill-in as a single REST request, reducing network calls and preventing race conditions completely.
7. **Unit Testing**: Added exhaustive automated tests in `sessionService.test.ts` validating batch cell updates and confirming thundering herd prevention under heavy concurrent loads.
8. **UX Enhancement**: Added a `min-h-[500px]` minimum size constraint to the `ParsewordsModal` container to prevent the modal dialog from expanding and contracting as tokens and operation buttons appear or disappear during parsewords gameplay.

### 2026-06-02 - Parsewords Puzzle Generator Upgraded with Multi-Tier Red Herrings

**Goal**: Make LLM-generated Parsewords puzzles highly challenging and robust by systematically introducing red herrings (dead ends) and role-confusion triggers.

**Completed**:
1. **Added Type Definition Support**: Updated `ParsewordsPuzzle` type declaration in `parsewordsGenerator.ts` to support the new optional `"analysis"` metadata block containing the correct path steps and a mapped catalog of red-herring opportunities.
2. **Rewrote Generator Prompt**: Rewrote `SYSTEM_PROMPT` inside `parsewordsGenerator.ts` to instruct the LLM to use a structured, multi-tier strategy for puzzle creation:
   - **JSON-based Chain of Thought**: Enforced that the model generates an `"analysis"` field *first*, serving as a scratchpad to map out correct solution steps and audit the clue's tokens for misleading opportunities before producing the puzzle structure.
   - **5 Tiers of Red Herrings**:
     - *Indicator Role Confusion*: Replace triggers that offer literal synonyms for indicator tokens, causing players to lose their indicator capability.
     - *Filler/Link Word Distractors*: Literal synonyms for non-essential link words that lead to dead ends.
     - *Fodder/Wordplay Synonym Dead Ends*: Extremely plausible alternate synonyms in replace options that leave players stuck.
     - *False Cryptic Operations*: Triggers offering plausible but incorrect operations (e.g. reversing when synonym swap is required).
     - *Definition Red Herrings*: Synonyms of the definition that never lead to the correct answer.
3. **Refined Trigger Ordering**: Instructed the LLM to strictly order the triggers: correct solution path first, then misleading red herrings, and definition red herrings last.
4. **Validation and Testing**: Verified that the generated puzzles pass the BFS solver validation. Ran all 106 backend tests, confirming perfect backward and forward compatibility.

### 2026-06-11 - Selected Cell Direction Indicators

**Goal**: Add a superimposed arrow on the selected square to show the current clue direction (across or down) without interfering with letter input.

**Completed**:
1. Added CSS keyframe animations `arrow-pop-across` and `arrow-pop-down` to `crossword-frontend/src/index.css` to handle spring-like scale and slide-in effects for arrows when a cell is selected or direction changes.
2. Updated `GridCell.tsx` to accept `selectedDirection?: Direction` and render `FaLongArrowAltRight` (bottom-centered) for across direction or `FaLongArrowAltDown` (right-centered) for down direction, with mobile vs. desktop responsive sizes (10px / 12px) to prevent interfering with letter inputs.
3. Updated `CrosswordGrid.tsx` to pass the `selectedDirection` prop down to the individual `GridCell` render loop.
4. Updated `DesktopView.tsx` and `MobileView.tsx` to extract the cursor's current direction (`cursor?.direction`) and supply it as `selectedDirection` to the `CrosswordGrid`.
5. Added a mock for `react-icons/fa` to `CrosswordGrid.perf.test.tsx` to prevent dual React resolution issues under Vitest.

6. Reordered the menu buttons in `DesktopView.tsx` and `MobileView.tsx` to place the Parsewords puzzle piece button on the right of the lock mode button.

