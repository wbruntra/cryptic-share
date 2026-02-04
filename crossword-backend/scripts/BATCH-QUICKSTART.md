# Automated Batch Explanation Processing - Quick Start

## Two Modes

### 1. Create Batches (Automated Discovery)

**Preview first (recommended):**
```bash
bun run batch-create -- --dry-run
```

**What `--dry-run` does:**
- Scans all puzzles
- Shows which ones need explanations
- Counts how many requests each puzzle would create
- Shows how many separate batch jobs would be created
- **No batches are actually created** - just shows what would happen

**Example output:**
```
🔬 DRY RUN: PREVIEW BATCH CREATION

PUZZLE ANALYSIS
P#  | ID  | Title          | Status | Requests | Total
————————————————————————————————————
 20 |   5 | 20             | ✅     |       32 | 0/32
 21 |   6 | 21             | ✅     |       30 | 0/30
 ...

SUMMARY
  Puzzles to process:  8
  Puzzles to skip:     0
  Total requests:      227

💡 Running without --dry-run will create 8 batch jobs (one per puzzle) with 227 total requests.
```

**Then actually create batches:**
```bash
bun run batch-create
```

**What it does:**
- Finds all puzzles with incomplete explanations
- Creates a **separate batch job for each puzzle**
- Verifies they have answers
- Automatically uploads to OpenAI
- Reports batch IDs for each puzzle

**No manual selection needed** - it processes all incomplete puzzles automatically, one batch per puzzle.

### 2. Retrieve & Apply Results

**Command:**
```bash
bun run batch-retrieve
```

**What it does:**
- Checks status of all pending batches
- Downloads results from completed batches
- Validates explanations against schema
- Stores valid results in database
- Marks batches as applied

**Runs completely automatically** - no prompts or selections.

## Quick Workflow

```bash
# Step 1: Create batches (takes a few minutes)
bun run batch-create

# Step 2: Wait 1-24 hours for OpenAI to process
# (Check OpenAI dashboard if needed)

# Step 3: Retrieve and apply results
bun run batch-retrieve

# Repeat: Go back to Step 1 if more puzzles need explanations
```

## Key Improvements Over Interactive Version

| Feature | Interactive | Automated |
|---------|-------------|-----------|
| Puzzle discovery | Manual selection from menu | Automatic |
| Batch creation | One puzzle at a time | All incomplete puzzles at once |
| Result retrieval | Manual selection from menu | All completed batches automatically |
| User prompts | Many confirmations | None - fully automated |
| Ideal for | Learning, testing | Production, scheduled jobs |

## Integration with Existing Tools

The automated script is compatible with all existing utilities:

- **View status:** `bun run batch-explanations` → Menu option 2
- **Validate results:** `bun run validate-explanations.ts`
- **Manual review:** `bun run regenerate-invalid-clues.ts`

## Database Monitoring

```bash
# Check pending batches
sqlite3 crossword.db <<EOF
SELECT batch_id, puzzle_id, status, created_at 
FROM explanation_batches 
WHERE applied_at IS NULL 
ORDER BY created_at DESC;
EOF
```

## Error Handling

The script logs errors but **continues processing**:

- ✅ Successfully created batches: Reported
- ❌ Puzzles without answers: Skipped
- ✅ Completed batches: Applied
- ❌ Validation failures: Skipped with logging
- ❌ API errors: Logged, can retry later

## Next Steps

1. Run `bun run batch-create` to start processing
2. Check back in 1-24 hours
3. Run `bun run batch-retrieve` to apply results
4. Review results using `bun run batch-explanations`

See `README-batch-automation.md` for detailed documentation.
