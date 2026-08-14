/**
 * Finds friends who each ended up with their own session for the same puzzle,
 * instead of sharing one as intended (e.g. because an anonymous session got
 * claimed on login before the friend-join logic checked for a friend's
 * session). Consolidates each such group into a single session per puzzle.
 *
 * Sessions are merged using only verified-correct, fully-filled answers from
 * each side (see getVerifiedCorrectState), so there's never a real conflict -
 * one session is kept (the oldest), the others' correct answers are folded in,
 * and the rest are deleted.
 *
 * Usage:
 *   bun run scripts/cleanup-orphan-friend-sessions.ts [--dry-run]
 */

import minimist from 'minimist'
import db from '../db-knex'
import { migrateLegacyState, countFilledLetters, mergeStates, isSessionUntouched } from '../utils/stateHelpers'
import { getVerifiedCorrectState } from '../utils/answerChecker'

async function main() {
  const argv = minimist(Bun.argv.slice(2), {
    boolean: ['dry-run', 'help'],
    alias: { h: 'help' },
  })

  if (argv.help) {
    console.log(`
Usage: bun run scripts/cleanup-orphan-friend-sessions.ts [--dry-run]

Consolidates duplicate friend sessions (same puzzle, same friend group, more
than one session row) into a single shared session. Pass --dry-run to preview
without writing anything.
`)
    return
  }

  const dryRun = Boolean(argv['dry-run'])
  if (dryRun) console.log('--- DRY RUN: no changes will be made ---\n')

  const friendships = await db('friendships')
    .where({ status: 'accepted' })
    .select('user_id_1', 'user_id_2')

  let mergedGroups = 0
  let deletedSessions = 0
  const seenPuzzleGroups = new Set<string>()

  for (const { user_id_1, user_id_2 } of friendships) {
    const rows = await db('puzzle_sessions')
      .whereIn('user_id', [user_id_1, user_id_2])
      .select('session_id', 'user_id', 'puzzle_id', 'state', 'attributions', 'created_at')

    const byPuzzle = new Map<number, typeof rows>()
    for (const row of rows) {
      const list = byPuzzle.get(row.puzzle_id) ?? []
      list.push(row)
      byPuzzle.set(row.puzzle_id, list)
    }

    for (const [puzzleId, sessions] of byPuzzle) {
      if (sessions.length < 2) continue

      // Two friendships could surface the same puzzle group more than once
      // (e.g. a 3-way friend cluster) - only process each group once.
      const groupKey = `${puzzleId}:${sessions
        .map((s) => s.session_id)
        .sort()
        .join(',')}`
      if (seenPuzzleGroups.has(groupKey)) continue
      seenPuzzleGroups.add(groupKey)

      const sorted = [...sessions].sort((a, b) => a.created_at.localeCompare(b.created_at))
      const keeper = sorted[0]!
      const rest = sorted.slice(1)

      console.log(`Puzzle ${puzzleId}: keeping ${keeper.session_id} (user ${keeper.user_id}), merging in:`)

      let mergedState = migrateLegacyState(JSON.parse(keeper.state))
      for (const session of rest) {
        const untouched = isSessionUntouched(session.state, session.attributions)
        console.log(
          `  - ${session.session_id} (user ${session.user_id})${untouched ? ' [untouched]' : ' [has progress]'}`,
        )

        if (!untouched) {
          const overlayState = migrateLegacyState(JSON.parse(session.state))
          const [verifiedKeeper, verifiedOverlay] = await Promise.all([
            getVerifiedCorrectState(puzzleId, mergedState),
            getVerifiedCorrectState(puzzleId, overlayState),
          ])
          mergedState = mergeStates(verifiedKeeper, verifiedOverlay)
        }
      }

      const filledCount = countFilledLetters(mergedState)
      const puzzle = await db('puzzles').where({ id: puzzleId }).select('letter_count').first()
      const isComplete = puzzle?.letter_count != null && filledCount >= puzzle.letter_count
      const now = new Date().toISOString()

      if (!dryRun) {
        await db('puzzle_sessions').where({ session_id: keeper.session_id }).update({
          state: JSON.stringify(mergedState),
          updated_at: now,
          is_complete: isComplete,
        })
        for (const session of rest) {
          await db('puzzle_sessions').where({ session_id: session.session_id }).del()
        }
      }

      mergedGroups++
      deletedSessions += rest.length
    }
  }

  console.log(
    `\n${dryRun ? 'Would consolidate' : 'Consolidated'} ${mergedGroups} puzzle/friend-group(s), ${dryRun ? 'would delete' : 'deleted'} ${deletedSessions} duplicate session(s).`,
  )

  process.exit(0)
}

main().catch((err) => {
  console.error('Script failed:', err)
  process.exit(1)
})
