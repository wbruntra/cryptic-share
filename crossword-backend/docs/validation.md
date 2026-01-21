# Explanation Validation

All clue explanations saved to the database are automatically validated against a strict JSON schema before insertion.

## How It Works

1. **Validation Utility** (`utils/validateExplanation.ts`)
   - Exports `validateExplanation()` - returns `{ valid, errors? }`
   - Exports `assertValidExplanation()` - throws error if invalid
   - Uses AJV (JSON Schema validator) with strict checking

2. **Integration** (`services/explanationService.ts`)
   - `saveExplanation()` method validates before database insert
   - Throws error and logs details if validation fails
   - Prevents invalid explanations from being saved

3. **Schema Format**
  The database stores only the inner **explanation object** (i.e. the `explanation` property from the model response):
   ```json
   {
     "clue_type": "wordplay",
     "definition": "honest",
     "letter_breakdown": [
       { "source": "Tense", "letters": "T" }
     ],
     "wordplay_steps": [...],
     "hint": { "definition_location": "start", "wordplay_types": [...] },
     "full_explanation": "..."
   }
   ```

## Validation Rules

### All Clue Types
- `clue_type` must be: `"wordplay"`, `"double_definition"`, `"&lit"`, `"cryptic_definition"`, or `"no_clean_parse"`
- No additional properties allowed beyond schema definition

### Wordplay & &lit
- `letters` field in `letter_breakdown` must match pattern `^[A-Z]+$` (uppercase only)
- Both `letter_breakdown` and `wordplay_steps` are required arrays
- Each item must have exact required fields: `{ source, letters }` and `{ indicator, operation, result }`

### Double Definition
- `definitions` array with items: `{ definition, sense }`
- `hint` must be: `{ definition_count: 2 }`

### Cryptic Definition
- `definition_scope`, `definition_paraphrase`, `hint` (object), and `full_explanation` required
- No `letter_breakdown` or `wordplay_steps` allowed

### No Clean Parse
- `intended_clue_type`, `issue`, `hint`, and `full_explanation` required
- Use this when a clean parse is not possible without inventing indicators or forcing letter accounting

## Scripts

- **Test validation**: `bun run scripts/test-validation.ts`
- **Validate database**: `bun run scripts/validate-explanations.ts`
- **Normalize existing data**: `bun run scripts/normalize-explanations.ts`

## Error Handling

When validation fails during batch processing:
```
❌ Validation failed for puzzle 4, clue 3 (across):
   Clue: "Long period covered by 2 (3)"
   Answer: ERA
   /letter_breakdown/0/letters: must match pattern "^[A-Z]+$" {"pattern":"^[A-Z]+$"}
```

The error is logged with full context and the explanation is **not saved** to prevent schema violations.

## Usage in Code

```typescript
import { validateExplanation, assertValidExplanation } from '../utils/validateExplanation'

// Option 1: Check validity
const result = validateExplanation(explanation)
if (!result.valid) {
  console.log('Errors:', result.errors)
}

// Option 2: Throw on invalid (used in saveExplanation)
try {
  assertValidExplanation(explanation)
  // Save to database...
} catch (error) {
  console.error('Invalid explanation:', error)
}
```
