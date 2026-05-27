/**
 * Generates a Parsewords mini-game puzzle definition from a cryptic clue explanation.
 *
 * The Parsewords game shows a cryptic clue word-by-word and lets the player
 * click tokens to discover operations/substitutions, gradually building the answer.
 */

import { OpenRouter } from '@openrouter/sdk'
import { OPENROUTER_MODELS } from '../config'

const client = new OpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
})

export const models = OPENROUTER_MODELS

const DEFAULT_MODEL = models['deepseek-pro']

// ---------------------------------------------------------------------------
// Schema (mirrors ParsewordsTestPage.tsx types — keep in sync)
// ---------------------------------------------------------------------------

export type TokenRole = 'definition' | 'wordplay' | 'indicator' | 'link'

export type TriggerAction =
  | { kind: 'replace'; options: string[] }
  | { kind: 'result'; options: string[] }
  | { kind: 'compute'; fn: 'trim-last' | 'trim-first' | 'reverse'; source: string }
  | { kind: 'container' }

export type Trigger = {
  match: string
  action: TriggerAction
}

export type PuzzleToken = {
  id?: string
  text: string
  role: TokenRole
}

export type ParsewordsPuzzle = {
  label: string
  clue: string
  answer: string
  displayAnswer?: string
  tokens: PuzzleToken[]
  triggers: Trigger[]
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are an expert at converting cryptic crossword clue explanations into interactive puzzle definitions for a word game called Parsewords.

## The Parsewords game

The player sees the clue words as clickable tokens. They click tokens (one or several at a time) to discover operations that gradually reduce the clue to the answer. The goal is to consume all non-definition tokens into the answer string, leaving only the definition tokens and the answer token.

## Token roles

Every word in the clue is its own token (never group multi-word phrases into one token). Assign each word one role:

- **definition**: words that form the definition part of the clue (these are NEVER consumed; they remain visible at the end as a label for the answer)
- **wordplay**: words that contribute letters or fodder to the answer
- **indicator**: words that signal a cryptic operation (e.g. reversal, anagram, deletion, container/insertion, hidden-word, homophone, initials)
- **link**: connecting words that relate the definition to the wordplay (e.g. "for", "gives") — ignored during solving. Use this role sparingly.

**Critical rule for token roles**: Look at the \`tokens\` arrays in the explanation's \`wordplay_steps\`. Every word that appears in any step's \`tokens\` list must be assigned a role based on its function:
- If a word is the thing being operated on (fodder, synonym source, abbreviation source), give it **wordplay**.
- If a word signals the operation (anagram indicator, reversal indicator, deletion indicator, container indicator, etc.), give it **indicator**.
- Words that appear together in a step (e.g. ["YULE", "nearly"]) may be a mix of wordplay + indicator.
- Only use **link** for words that do not appear in any step's tokens list AND are not part of the definition.
- Never assign **link** to a word just because it is short (e.g. "of", "in", "the") — check whether it appears in a step first.

## Triggers

A trigger fires when the player selects a contiguous group of tokens whose texts, joined by spaces in clue order, exactly equal the trigger's \`match\` string. Each trigger has a \`match\` string and an \`action\`:

### action kinds

1. **replace** — One token is a wordplay word with synonym options. The player picks a synonym; that single token's text is replaced in-place. Use this when the player must find the right synonym before combining.
   \`{ kind: "replace", options: ["SYN1", "SYN2", "SYN3"] }\`
   - Always include at least 3 options; the correct one first, then plausible red herrings.
   - Options should be ALL CAPS if they are letter-strings to be used in wordplay.

2. **result** — Multiple tokens combine into a new wordplay token. Tokens are consumed and replaced by one new token. Use for: anagram indicator + fodder → anagram result; initials indicator + words → initials; "in full" + initials → spelled-out letters; homophone indicator + word → sound-alike.
   \`{ kind: "result", options: ["CORRECT", "WRONG1", "WRONG2"] }\`
   - Include 3 options; correct one first, rest are plausible wrong anagrams/results.

3. **compute** — A single operation on one token's text, deterministic:
   - \`fn: "trim-last"\`: removes the last letter (for "nearly", "almost", "short of" etc.)
   - \`fn: "trim-first"\`: removes the first letter (for "has lost its crown", "beheaded", "losing its head" etc.)
   - \`fn: "reverse"\`: reverses the string (for "back", "returned", "over" etc.)
   - \`source\`: the current text of the token to operate on
   \`{ kind: "compute", fn: "trim-last", source: "WORD" }\`
   - match includes the wordplay token text AND the indicator token text

4. **container** — Two wordplay tokens; inserts one inside the other at every position to generate candidates. The player picks the correct insertion. Use for container/insertion indicators ("holds", "in", "contains", "embraces", "about" etc.).
   \`{ kind: "container" }\`
   - match includes the indicator token text AND the two wordplay tokens

## Rules

- Tokens are listed in clue word order. Do not include an \`id\` field on tokens.
- After a trigger fires (replace/result/compute/container), the tokens it consumed are replaced by a single new wordplay token. Subsequent triggers must reference the NEW text.
- **The final state must be: one wordplay token whose text equals \`answer\` (normalized, no spaces) + the definition tokens.**
- For multi-word answers (e.g. "MAIL ORDER"), set \`answer\` to the concatenated form ("MAILORDER") and \`displayAnswer\` to the spaced form ("MAIL ORDER").
- Triggers should be ordered to guide the player from the raw clue to the answer in logical steps.
- The \`label\` field is the answer with spaces if multi-word (e.g. "MAIL ORDER"), otherwise just the answer.

### Concatenation rule (critical — do not omit)

When two or more separate wordplay fragments must be joined to form the answer, you **must** add a final \`result\` trigger that matches all remaining wordplay tokens in order and produces the answer. This step explicitly tells the player how the pieces combine.

Example: if after earlier triggers the remaining wordplay tokens are "I" and "MPOUND" (which together spell IMPOUND):
\`\`\`json
{ "match": "I MPOUND", "action": { "kind": "result", "options": ["IMPOUND", "MIPOUND", "UNDPOMI"] } }
\`\`\`

This applies whenever the answer is assembled by concatenating two or more independently derived fragments. Without this final trigger the puzzle is unsolvable — the player has no way to finish.

## Trigger ordering (required)

**Put solution triggers first, red herring triggers last.**

The triggers array must be ordered so that the correct solution path comes first. Red herring triggers (especially the definition red herring below) must be appended at the end of the array, after all solution triggers.

This ordering is used by automated validation to verify the puzzle is solvable.

## Definition red herrings (required)

Always add a **replace** trigger for the definition token(s) **at the end of the triggers array**. The options should be plausible synonyms of the definition — but must NOT include the actual answer. These are intentional dead ends: the player may try clicking the definition, get a synonym, and discover it leads nowhere, which teaches them that the definition is not the wordplay path. This is an important part of the puzzle design.

- If the definition is a single word, add a single-token replace trigger.
- If the definition spans multiple adjacent tokens, add a multi-token replace trigger for the whole span.
- Options must be genuine synonyms of the definition sense (not nonsense). **Never include the answer itself** as one of the options — the whole point is that this path leads nowhere.
- Include exactly 3 options.

## Output format

Return a single JSON object with this exact shape:
\`\`\`json
{
  "label": "ANSWER",
  "clue": "original clue text",
  "answer": "ANSWER",
  "displayAnswer": "ANSWER WITH SPACES (omit if single word)",
  "tokens": [
    { "text": "Word", "role": "definition|wordplay|indicator|link" },
    ...
  ],
  "triggers": [
    { "match": "text1 text2", "action": { "kind": "replace|result|compute|container", ... } },
    ...
  ]
}
\`\`\`

## Example puzzle (TROUNCE — anagram)

Clue: "Beat counter, frustrated (7)"
Answer: TROUNCE

\`\`\`json
{
  "label": "TROUNCE",
  "clue": "Beat counter, frustrated (7)",
  "answer": "TROUNCE",
  "tokens": [
    { "text": "Beat", "role": "definition" },
    { "text": "counter,", "role": "wordplay" },
    { "text": "frustrated", "role": "indicator" }
  ],
  "triggers": [
    {
      "match": "counter, frustrated",
      "action": { "kind": "result", "options": ["TROUNCE", "RECOUNT", "CORNUTE"] }
    },
    {
      "match": "Beat",
      "action": { "kind": "replace", "options": ["DEFEAT", "THRASH", "PUMMEL"] }
    }
  ]
}
\`\`\`

## Example puzzle (LULLABY — deletion + reversals + container)

Clue: "With Christmas nearly over recall dance's sleepy tune (7)"
Answer: LULLABY

\`\`\`json
{
  "label": "LULLABY",
  "clue": "With Christmas nearly over recall dance's sleepy tune (7)",
  "answer": "LULLABY",
  "tokens": [
    { "text": "With", "role": "indicator" },
    { "text": "Christmas", "role": "wordplay" },
    { "text": "nearly", "role": "indicator" },
    { "text": "over", "role": "indicator" },
    { "text": "recall", "role": "indicator" },
    { "text": "dance's", "role": "wordplay" },
    { "text": "sleepy", "role": "definition" },
    { "text": "tune", "role": "definition" }
  ],
  "triggers": [
    { "match": "Christmas", "action": { "kind": "replace", "options": ["YULE", "NOEL", "XMAS"] } },
    { "match": "dance's", "action": { "kind": "replace", "options": ["BALL", "WALTZ", "JIVE"] } },
    { "match": "YULE nearly", "action": { "kind": "compute", "fn": "trim-last", "source": "YULE" } },
    { "match": "YUL over", "action": { "kind": "compute", "fn": "reverse", "source": "YUL" } },
    { "match": "BALL recall", "action": { "kind": "compute", "fn": "reverse", "source": "BALL" } },
    { "match": "With LUY LLAB", "action": { "kind": "container" } },
    { "match": "sleepy tune", "action": { "kind": "replace", "options": ["CRADLE SONG", "SERENADE", "NOCTURNE"] } }
  ]
}
\`\`\`

Note: the first trigger is the definition red herring — "sleepy tune" can be replaced with synonyms like CRADLE SONG, but none lead to LULLABY via wordplay, making it a dead end. The answer LULLABY is intentionally absent from those options.
Note: after "Christmas" is replaced with "YULE", subsequent triggers reference "YULE" (the new text), not "Christmas".

## Example puzzle (IMPOUND — abbreviation + anagram + concatenation)

Clue: "Seize first person playing on dump (7)"
Answer: IMPOUND

\`\`\`json
{
  "label": "IMPOUND",
  "clue": "Seize first person playing on dump (7)",
  "answer": "IMPOUND",
  "tokens": [
    { "text": "Seize", "role": "definition" },
    { "text": "first", "role": "indicator" },
    { "text": "person", "role": "wordplay" },
    { "text": "playing", "role": "indicator" },
    { "text": "on", "role": "wordplay" },
    { "text": "dump", "role": "wordplay" }
  ],
  "triggers": [
    { "match": "first person", "action": { "kind": "result", "options": ["I", "ME", "HE"] } },
    { "match": "on dump playing", "action": { "kind": "result", "options": ["MPOUND", "DUNPOM", "PONDMU"] } },
    { "match": "I MPOUND", "action": { "kind": "result", "options": ["IMPOUND", "IMOPUND", "MIPOUND"] } },
    { "match": "Seize", "action": { "kind": "replace", "options": ["CONFISCATE", "CAPTURE", "GRAB"] } }
  ]
}
\`\`\`

Note: solution triggers come first (abbreviation → I, anagram → MPOUND, concatenation → IMPOUND), and the definition red herring ("Seize" → CONFISCATE etc.) is last. The final concatenation trigger is mandatory — without it the puzzle is unsolvable.
`

// ---------------------------------------------------------------------------
// Generator function
// ---------------------------------------------------------------------------

export async function generateParsewordsPuzzle(
  clueText: string,
  answer: string,
  explanationJson: unknown,
  model = DEFAULT_MODEL,
): Promise<ParsewordsPuzzle> {
  const userMessage = `Here is the cryptic crossword clue, its answer, and the expert explanation of how it works. Generate the Parsewords puzzle definition.

Clue: ${clueText}
Answer: ${answer}

Explanation:
${JSON.stringify(explanationJson, null, 2)}

Return only the JSON puzzle object, no other text.`

  const result = await client.chat.send({
    chatRequest: {
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      responseFormat: { type: 'json_object' },
      stream: false,
    },
  })

  const content = result?.choices[0]?.message.content
  if (!content) throw new Error('Empty response from model')
  if (typeof content !== 'string') throw new Error('Expected string content from model')

  const parsed = JSON.parse(content) as ParsewordsPuzzle
  return parsed
}

if (import.meta.main) {
  const args = Bun.argv.slice(2)
  if (args.length < 1) {
    console.error('Usage: bun utils/parsewordsGenerator.ts <clue-explanation-id> [model-slug]')
    console.error('')
    console.error('Available model slugs:')
    for (const [key, slug] of Object.entries(models)) {
      console.error(`  ${key.padEnd(16)} ${slug}`)
    }
    process.exit(1)
  }

  const { default: db } = await import('../db-knex')

  const id = parseInt(args[0]!, 10)
  const modelKey = args[1]
  const modelSlug = modelKey ? (models[modelKey as keyof typeof models] ?? modelKey) : DEFAULT_MODEL

  const row = await db('clue_explanations').where('id', id).first()
  if (!row) {
    console.error(`No clue_explanation found with id=${id}`)
    process.exit(1)
  }

  const explanation = JSON.parse(row.explanation_json)

  console.log(`Clue:   ${row.clue_text}`)
  console.log(`Answer: ${row.answer}`)
  console.log(`Model:  ${modelSlug}`)
  console.log()

  const start = performance.now()
  const result = await generateParsewordsPuzzle(row.clue_text, row.answer, explanation, modelSlug)
  const elapsed = ((performance.now() - start) / 1000).toFixed(2)

  console.log(JSON.stringify(result, null, 2))
  console.log(`\nResponse time: ${elapsed}s`)

  await db.destroy()
}
