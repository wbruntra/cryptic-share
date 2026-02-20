# Napkin

## Corrections

| Date | Source | What Went Wrong | What To Do Instead |
| ---- | ------ | --------------- | ------------------ |

## User Preferences

- (accumulate here as you learn them)

## Patterns That Work

- (approaches that succeeded)

## Patterns That Don't Work

- (approaches that failed and why)

## Domain Notes

- (project/domain context that matters)

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
