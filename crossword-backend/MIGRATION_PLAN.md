# Migration Plan: explanation_json Format Change

## Overview

The `explanation_json` column in `clue_explanations` table needs to be migrated from the old flat structure to the new nested structure with `clue_type` support.

## Format Change

### OLD FORMAT (flat structure)
```json
{
  "definition": "Become extinct",
  "letter_breakdown": [...],
  "wordplay_steps": [...],
  "hint": {
    "definition_location": "start",
    "wordplay_types": ["anagram", "abbreviation"]
  },
  "full_explanation": "..."
}
```

### NEW FORMAT (nested with clue_type)
```json
{
  "clue_type": "wordplay",
  "explanation": {
    "clue_type": "wordplay",
    "definition": "Become extinct",
    "letter_breakdown": [...],
    "wordplay_steps": [...],
    "hint": {
      "definition_location": "start",
      "wordplay_types": ["anagram", "abbreviation"]
    },
    "full_explanation": "..."
  }
}
```

## Migration Strategy

### Option 1: Database Migration Script (Recommended)
Create a Knex migration that:
1. Reads all existing `clue_explanations` rows
2. For each row, wraps the old format in the new structure
3. Updates the row with the new format

**Pros:**
- One-time operation
- Clean migration history
- No runtime overhead

**Cons:**
- Requires identifying the clue_type for existing entries (default to "wordplay" since that was the only type before)

### Option 2: Runtime Migration on Read
Update `ExplanationService.getCachedExplanation()` to:
1. Check if the format is old (missing `clue_type` at top level)
2. If old format, wrap it in new structure
3. Optionally update the database row immediately

**Pros:**
- No downtime required
- Gradual migration
- Handles edge cases automatically

**Cons:**
- Runtime performance impact (minimal)
- Data remains in old format until accessed

### Option 3: Hybrid Approach
1. Create a migration script that converts existing data
2. Add backward-compatibility code in `getCachedExplanation()` for any stragglers
3. Remove compatibility code after confirming all data migrated

**Pros:**
- Best of both worlds
- Safest approach
- Easy rollback

**Cons:**
- More code to write initially

## Recommended Approach: Option 3 (Hybrid)

### Step 1: Create Migration Script
File: `crossword-backend/scripts/migrate-explanation-format.ts`

```typescript
import db from '../db-knex'

interface OldFormat {
  definition?: string
  letter_breakdown?: any[]
  wordplay_steps?: any[]
  hint?: any
  full_explanation?: string
}

interface NewFormat {
  clue_type: string
  explanation: any
}

async function migrateExplanations() {
  const rows = await db('clue_explanations').select('*')
  
  let migrated = 0
  let skipped = 0
  
  for (const row of rows) {
    const data = JSON.parse(row.explanation_json)
    
    // Check if already in new format
    if (data.clue_type && data.explanation) {
      skipped++
      continue
    }
    
    // Wrap in new format (default to 'wordplay' for old entries)
    const newFormat: NewFormat = {
      clue_type: 'wordplay',
      explanation: {
        clue_type: 'wordplay',
        ...data
      }
    }
    
    await db('clue_explanations')
      .where('id', row.id)
      .update({
        explanation_json: JSON.stringify(newFormat)
      })
    
    migrated++
  }
  
  console.log(`Migration complete: ${migrated} migrated, ${skipped} skipped`)
}

migrateExplanations().then(() => process.exit(0))
```

### Step 2: Update ExplanationService Type Definition

Update `ClueExplanation` interface to match new format:

```typescript
// NEW interface structure
export interface ClueExplanation {
  clue_type: 'wordplay' | 'double_definition' | '&lit' | 'cryptic_definition'
  explanation: WordplayExplanation | DoubleDefinitionExplanation | AndLitExplanation | CrypticDefinitionExplanation
}

export interface WordplayExplanation {
  clue_type: 'wordplay'
  definition: string
  letter_breakdown: Array<{ source: string; letters: string }>
  wordplay_steps: Array<{ indicator: string; operation: string; result: string }>
  hint: {
    definition_location: 'start' | 'end'
    wordplay_types: string[]
  }
  full_explanation: string
}

// ... other explanation types
```

### Step 3: Add Backward Compatibility to ExplanationService

```typescript
static async getCachedExplanation(
  puzzleId: number,
  clueNumber: number,
  direction: string,
): Promise<ClueExplanation | null> {
  const row = await db<StoredExplanation>('clue_explanations')
    .where({
      puzzle_id: puzzleId,
      clue_number: clueNumber,
      direction: direction,
    })
    .first()

  if (!row) {
    return null
  }

  const data = JSON.parse(row.explanation_json)
  
  // Handle old format (backward compatibility)
  if (!data.clue_type || !data.explanation) {
    // Old format - wrap it
    return {
      clue_type: 'wordplay',
      explanation: {
        clue_type: 'wordplay',
        ...data
      }
    }
  }

  return data as ClueExplanation
}
```

### Step 4: Update Frontend to Handle New Format

The frontend code that receives explanations will need to be updated to access:
- `explanation.clue_type` instead of direct properties
- `explanation.explanation.*` for the actual explanation data

## Execution Plan

1. ✅ Update `crypticSchema.ts` with new types (DONE)
2. Create migration script (`scripts/migrate-explanation-format.ts`)
3. Update `ExplanationService` interface and types
4. Add backward compatibility to `getCachedExplanation()`
5. Run migration script: `bun run scripts/migrate-explanation-format.ts`
6. Test with existing data
7. Update frontend to handle new format
8. Deploy backend changes
9. Deploy frontend changes
10. After 1-2 weeks, remove backward compatibility code (optional)

## Rollback Plan

If issues arise:
1. The migration script can be reversed (unwrap the structure)
2. Backward compatibility code ensures old format still works
3. Database backups available via existing backup system

## Testing Checklist

- [ ] Run migration script on dev database
- [ ] Verify all explanations still display correctly
- [ ] Test new explanations being created
- [ ] Test explanation caching
- [ ] Test batch explanation scripts
- [ ] Verify frontend displays all explanation types correctly
- [ ] Check that double_definition, &lit, and cryptic_definition work
