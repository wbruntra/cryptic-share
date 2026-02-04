# Automated Batch Explanation Processing

This document describes the automated batch processing workflow for cryptic crossword explanations.

## Overview

The `batch-explanation-auto.ts` script provides two modes:

1. **Create batches** (default): Automatically finds puzzles needing explanations and creates batch jobs
2. **Retrieve batches**: Downloads and applies results from completed batches

## Architecture

### Workflow

```
1. Find puzzles needing explanations
   ↓
2. Verify they have answers (answers_encrypted)
   ↓
3. Create batch jobs for remaining clues
   ↓
4. [Wait 1-24 hours for OpenAI to process]
   ↓
5. Retrieve completed batches
   ↓
6. Validate results against ExplanationSchema
   ↓
7. Store explanations in database
```

## Usage

### Create Batch Jobs

#### Preview with Dry Run (Recommended First Step)

See exactly what would happen without creating any batches:

```bash
bun scripts/batch-explanation-auto.ts --dry-run
```

This will:
- Scan all puzzles for incomplete explanations
- Count how many requests would be created for each puzzle
- Show the total number of batch jobs and requests
- **Not create any batches** - just a preview

**Output example:**
```
============================================================
🔬 DRY RUN: PREVIEW BATCH CREATION
============================================================

PUZZLE ANALYSIS
————————————————————————————————————————————————————————————
P#  | ID  | Title                      | Status    | Requests | Total
————————————————————————————————————————————————————————————
 20 |   5 | 20                         | ✅       |       32 | 0/32
 21 |   6 | 21                         | ✅       |       30 | 0/30
 ...

📈 SUMMARY
  Puzzles to process:  8
  Puzzles to skip:     0
  Total requests:      227

💡 Running without --dry-run will create 1 batch jobs with 227 total requests.
```

#### Actually Create Batch Jobs

After previewing with `--dry-run`, create the actual batch jobs:

```bash
bun scripts/batch-explanation-auto.ts
```

This will:
- Find all puzzles with incomplete explanations
- Verify they have answer data
- Skip clues that already have explanations
- Create OpenAI batch jobs for remaining clues
- Save batch records to the database

**Output:**
```
🔍 Finding puzzles that need explanations...

Found 8 puzzle(s) needing explanations:
  P#20 (ID: 5) "20": 0/32 (32 remaining)
  P#21 (ID: 6) "21": 0/30 (30 remaining)
  ...

📦 CREATING BATCH JOBS

Processing 8 puzzle(s)...

✅ BATCH CREATION COMPLETE

Created 8 batch job(s):
  P#20: batch_1234567890abcdef
  P#21: batch_fedcba0987654321
  ...

💡 Next steps:
   1. Wait for batches to complete (typically 1-24 hours)
   2. Run: bun scripts/batch-explanation-auto.ts retrieve
   3. Results will be automatically downloaded and applied
```

### Retrieve and Apply Completed Batches

Download results from all completed batches and apply them to the database:

```bash
bun scripts/batch-explanation-auto.ts retrieve
```

This will:
- Find all unapplied batches
- Check their status with OpenAI
- Download results from completed batches
- Validate explanations against the schema
- Store valid explanations in the database
- Mark batches as `applied_at`

**Output:**
```
============================================================
📥 RETRIEVING COMPLETED BATCHES
============================================================

Found 3 unapplied batch(es). Checking status...

✅ batch_1234567890abcdef - completed
⏳ batch_fedcba0987654321 - in_progress
❌ batch_another1234567 - failed

📥 Found 1 completed batch(es). Processing results...

Processing batch batch_1234567890abcdef...
  📥 Downloading results...
  ⚙️  Processing 32 results...
  ✅ Saved: 28, Failed: 3, Validation failed: 1
  ✓ Batch marked as applied
```

## Database Schema

### explanation_batches table

```sql
CREATE TABLE explanation_batches (
  id INTEGER PRIMARY KEY,
  batch_id TEXT UNIQUE NOT NULL,
  puzzle_id INTEGER NOT NULL REFERENCES puzzles(id),
  status TEXT NOT NULL DEFAULT 'pending',
  input_file_id TEXT NOT NULL,
  output_file_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  applied_at DATETIME
);
```

**Fields:**
- `batch_id`: OpenAI batch ID (immutable)
- `status`: One of `pending`, `in_progress`, `validating`, `finalizing`, `completed`, `failed`, `cancelled`, `expired`
- `input_file_id`: OpenAI file ID for the input JSONL
- `output_file_id`: OpenAI file ID for results (set when completed)
- `applied_at`: When results were successfully stored in the database

### clue_explanations table

```sql
CREATE TABLE clue_explanations (
  id INTEGER PRIMARY KEY,
  puzzle_id INTEGER NOT NULL REFERENCES puzzles(id),
  clue_number INTEGER NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('across', 'down')),
  clue_text TEXT NOT NULL,
  answer TEXT NOT NULL,
  explanation_json TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## How It Works

### Finding Incomplete Puzzles

The script queries all puzzles and compares the number of clues in `puzzle.clues` with the count of explanations in `clue_explanations`. Puzzles with `explained < total` are candidates for batch processing.

### Verifying Answers

Before creating a batch, the script checks that:
1. The puzzle exists
2. `answers_encrypted` can be parsed as JSON
3. Both `across` and/or `down` answer arrays exist

### Creating Batch Requests

For each unanswered clue:
1. Skip if an explanation already exists
2. Decrypt the answer using ROT13
3. Generate explanation prompt using `generateExplanationMessages()`
4. Create batch request with custom ID format: `p{puzzleId}_c{clueNumber}_{direction}`
5. Upload JSONL to OpenAI

**Batch Request Format:**
```json
{
  "custom_id": "p5_c1_across",
  "method": "POST",
  "url": "/v1/responses",
  "body": {
    "model": "gpt-5-mini",
    "reasoning": { "effort": "medium" },
    "input": [{ "role": "user", "content": [...] }],
    "text": { "format": {...} }
  }
}
```

### Processing Results

When a batch completes, the script:
1. Fetches the output file from OpenAI
2. Parses JSONL results (one JSON object per line)
3. For each result:
   - Parses the response structure (handles both Responses API and Chat Completions formats)
   - Decodes HTML entities
   - Validates against `ExplanationSchema` using Zod
   - Saves to database using `ExplanationService.saveExplanation()`

## Status Codes

The script displays batch status with emojis:

| Status | Emoji | Meaning |
|--------|-------|---------|
| pending | ⏳ | Waiting to be processed |
| in_progress | 🔄 | Currently processing |
| validating | 🔍 | Validating results |
| finalizing | ⏱️ | Finalizing output |
| completed | ✅ | Successfully completed |
| failed | ❌ | Batch failed |
| cancelled | ❌ | User cancelled |
| expired | ⏰ | Expired (not processed in 24h) |

## Error Handling

### Creation Failures

If a batch creation fails:
- The error is logged with the puzzle ID
- Processing continues with the next puzzle
- No partial batches are created

### Retrieval Failures

If result retrieval/processing fails:
- Individual clues with validation errors are skipped
- Failed requests are counted and logged
- Partially completed batches still save valid results
- Failed results can be manually reviewed and resubmitted

### Validation Failures

Explanations that don't match `ExplanationSchema` are:
- Logged with validation errors
- **Not saved** to the database
- Counted in the "Validation failed" counter
- Can be investigated using `validate-explanations.ts` script

## Monitoring

### Check Batch Status Manually

```bash
# Using the interactive tool
bun scripts/batch-explanation-interactive.ts

# Select option 2: View recent batch jobs
# Select option 4: Check batch status
```

### View Database Records

```sql
-- All pending batches
SELECT * FROM explanation_batches WHERE applied_at IS NULL ORDER BY created_at DESC;

-- Completed but not applied
SELECT * FROM explanation_batches WHERE status = 'completed' AND applied_at IS NULL;

-- Summary by puzzle
SELECT 
  p.id, p.title, p.puzzle_number,
  eb.batch_id, eb.status, eb.created_at
FROM explanation_batches eb
JOIN puzzles p ON eb.puzzle_id = p.id
ORDER BY p.puzzle_number;
```

## Performance Considerations

### Batch Limits

- OpenAI has rate limits on batch creation
- Each batch can contain many requests (typically 10k+)
- All clues for a puzzle fit in a single batch

### Timeout & Completion

- Batches expire after 24 hours if not completed
- Most batches complete within 1-6 hours
- Check status periodically: `bun scripts/batch-explanation-auto.ts retrieve`

### Database Load

- Large batches (300+ clues) may take a few minutes to process
- Results are stored one at a time with individual transactions
- Consider running during off-peak hours for very large batches

## Troubleshooting

### No puzzles need explanations

```
✅ All puzzles have complete explanations!
```

**Solution:** All clues have been explained. Check the database:
```sql
SELECT p.id, p.title, COUNT(ce.id) as explanations
FROM puzzles p
LEFT JOIN clue_explanations ce ON p.id = ce.puzzle_id
GROUP BY p.id;
```

### "No answers found for puzzle"

The puzzle has no encrypted answers in the database.

**Solution:**
1. Verify answers were uploaded: check `puzzles.answers_encrypted`
2. If empty, add answers through the admin interface

### Batch stuck in "pending" or "in_progress"

**Solution:**
- Wait longer (OpenAI takes time)
- Check OpenAI status page for outages
- Run retrieve command again: `bun scripts/batch-explanation-auto.ts retrieve`

### Validation errors on results

Explanations failed Zod validation.

**Solution:**
1. Run validation checker: `bun scripts/validate-explanations.ts`
2. Review the specific validation errors
3. May indicate an issue with the prompt or schema version
4. Use interactive tool to manually review and re-prompt

### Database issues

**Solution:**
1. Check database connection: `bun scripts/batch-explanation-interactive.ts` → View status
2. Verify tables exist: `bun run migrate:latest`
3. Check for locked tables: ensure no other processes are accessing the database

## Advanced Usage

### Manually Create Batch for Single Puzzle

Edit the script to add:
```typescript
// Replace main() with:
async function main() {
  await createBatchForPuzzle(5) // Puzzle ID
}
```

### Skip Certain Puzzles

Add a filter in `findPuzzlesNeedingExplanations()`:
```typescript
if (puzzlesNeedingExplanations.length === 0 || 
    puzzlesNeedingExplanations.some(p => p.id === 5)) { // Skip puzzle 5
  return []
}
```

### Adjust OpenAI Model or Reasoning

In `createBatchForPuzzle()`, modify the batch body:
```typescript
body: {
  model: 'gpt-4o', // Change model
  reasoning: { effort: 'high' }, // Adjust reasoning effort
  ...
}
```

## See Also

- `batch-explanation-interactive.ts` - Interactive version with menus
- `retrieve-batch.ts` - Standalone batch retrieval
- `validate-explanations.ts` - Validate all stored explanations
- `regenerate-invalid-clues.ts` - Regenerate explanations for invalid clues
