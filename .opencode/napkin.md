# Napkin

## Corrections
| Date | Source | What Went Wrong | What To Do Instead |
|------|--------|----------------|-------------------|

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
