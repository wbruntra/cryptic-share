# Improve Grid Constructor to Solve All Puzzles

The current [constructGridFromAnswerKey](file:///home/william/src/tries/2026-01-06-cryptic-share/crossword-backend/utils/gridConstructor.ts#391-533) in [gridConstructor.ts](file:///home/william/src/tries/2026-01-06-cryptic-share/crossword-backend/utils/gridConstructor.ts) solves 4/12 puzzles within 2M states. The remaining 8 exhaust the budget because the search space is too large.

## Root Cause

The solver places clue numbers one at a time, scanning every cell as a candidate start position. For a 15×15 grid with 29 numbered positions, the search tree branches up to ~225 times at each depth level, giving a combinatorial explosion.

**The key insight it's missing:** a cell is only a valid numbered-cell start if:
- The cell before it (in whatever direction) is a **block** or the grid boundary
- The cell after it continues with at least one more **letter** cell

This means we don't need to try all 225 cells — we can **precompute which cells are structurally valid start positions** for across, down, or both, and only search those. This is a form of constraint propagation that dramatically prunes the search.

## Proposed Changes

### [MODIFY] [gridConstructor.ts](file:///home/william/src/tries/2026-01-06-cryptic-share/crossword-backend/utils/gridConstructor.ts)

Replace the inner search loop with a smarter algorithm:

1. **Precompute candidate positions**: Before search begins, identify which cells *could* be a numbered-cell start for a given spec. A cell [(r,c)](file:///home/william/src/tries/2026-01-06-cryptic-share/crossword-backend/scripts/verify-grid-constructor-answer-only.ts#13-59) is a valid start for a spec with:
   - **across length L**: `col + L <= width` AND `col == 0 || cell before is block-eligible` 
   - **down length L**: `row + L <= height` AND `row == 0 || cell above is block-eligible`

2. **Build per-spec candidate lists**: For each [NumberSpec](file:///home/william/src/tries/2026-01-06-cryptic-share/crossword-backend/utils/gridConstructor.ts#43-48), compute only the cells satisfying both its across and down requirements. Think of this as intersection of constraints.

3. **Order specs by most-constrained-first** (MCV heuristic): Try placing specs with fewest candidates first to fail fast.

4. **Forward checking**: After placing a spec, immediately remove invalidated candidates from remaining specs. If any spec has zero candidates left, backtrack immediately.

5. **Letter conflict detection**: When answers are provided, check letter-by-letter during placement that crossing answers agree (this is already partially done but can be leveraged earlier for pruning).

The interface and types remain unchanged — only the internal search logic improves.

## Verification Plan

### Automated Tests

1. **Existing unit test** — must still pass:
   ```bash
   bun test tests/gridConstructor.test.ts
   ```

2. **Full database verification** — all puzzles must pass:
   ```bash
   bun run scripts/verify-grid-constructor-answer-only.ts
   ```
   Currently: 4 ✅ 8 ❌ → target: 12 ✅ 0 ❌