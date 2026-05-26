/**
 * Generates a Parsewords mini-game puzzle definition from a cryptic clue explanation.
 *
 * The Parsewords game shows a cryptic clue word-by-word and lets the player
 * click tokens to discover operations/substitutions, gradually building the answer.
 */

import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

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
  match: string[]
  action: TriggerAction
}

export type PuzzleToken = {
  id: string
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

A trigger fires when the player selects an exact set of tokens (by their current text, order-independent). Each trigger has a \`match\` array of token texts and an \`action\`:

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

- Tokens are listed in clue word order.
- Token IDs: use "t1", "t2", ... in order.
- After a trigger fires (replace/result/compute/container), the tokens it consumed are replaced by a single new wordplay token. Subsequent triggers must reference the NEW text.
- The final state must be: one wordplay token whose text equals \`answer\` (normalized, no spaces) + the definition tokens.
- For multi-word answers (e.g. "MAIL ORDER"), set \`answer\` to the concatenated form ("MAILORDER") and \`displayAnswer\` to the spaced form ("MAIL ORDER").
- Triggers should be ordered to guide the player from the raw clue to the answer in logical steps.
- The \`label\` field is the answer with spaces if multi-word (e.g. "MAIL ORDER"), otherwise just the answer.

## Output format

Return a single JSON object with this exact shape:
\`\`\`json
{
  "label": "ANSWER",
  "clue": "original clue text",
  "answer": "ANSWER",
  "displayAnswer": "ANSWER WITH SPACES (omit if single word)",
  "tokens": [
    { "id": "t1", "text": "Word", "role": "definition|wordplay|indicator|link" },
    ...
  ],
  "triggers": [
    { "match": ["text1", "text2"], "action": { "kind": "replace|result|compute|container", ... } },
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
    { "id": "t1", "text": "Beat", "role": "definition" },
    { "id": "t2", "text": "counter,", "role": "wordplay" },
    { "id": "t3", "text": "frustrated", "role": "indicator" }
  ],
  "triggers": [
    {
      "match": ["Beat"],
      "action": { "kind": "replace", "options": ["DEFEAT", "THRASH", "PUMMEL"] }
    },
    {
      "match": ["counter,", "frustrated"],
      "action": { "kind": "result", "options": ["TROUNCE", "RECOUNT", "CORNUTE"] }
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
    { "id": "t1", "text": "With", "role": "indicator" },
    { "id": "t2", "text": "Christmas", "role": "wordplay" },
    { "id": "t3", "text": "nearly", "role": "indicator" },
    { "id": "t4", "text": "over", "role": "indicator" },
    { "id": "t5", "text": "recall", "role": "indicator" },
    { "id": "t6", "text": "dance's", "role": "wordplay" },
    { "id": "t7", "text": "sleepy", "role": "definition" },
    { "id": "t8", "text": "tune", "role": "definition" }
  ],
  "triggers": [
    { "match": ["Christmas"], "action": { "kind": "replace", "options": ["YULE", "NOEL", "XMAS"] } },
    { "match": ["dance's"], "action": { "kind": "replace", "options": ["BALL", "WALTZ", "JIVE"] } },
    { "match": ["YULE", "nearly"], "action": { "kind": "compute", "fn": "trim-last", "source": "YULE" } },
    { "match": ["YUL", "over"], "action": { "kind": "compute", "fn": "reverse", "source": "YUL" } },
    { "match": ["BALL", "recall"], "action": { "kind": "compute", "fn": "reverse", "source": "BALL" } },
    { "match": ["With", "LUY", "LLAB"], "action": { "kind": "container" } }
  ]
}
\`\`\`

Note how after "Christmas" is replaced with "YULE", the next trigger references "YULE" (the new text), not "Christmas".
`

// ---------------------------------------------------------------------------
// Generator function
// ---------------------------------------------------------------------------

export async function generateParsewordsPuzzle(
  clueText: string,
  answer: string,
  explanationJson: unknown,
): Promise<ParsewordsPuzzle> {
  const userMessage = `Here is the cryptic crossword clue, its answer, and the expert explanation of how it works. Generate the Parsewords puzzle definition.

Clue: ${clueText}
Answer: ${answer}

Explanation:
${JSON.stringify(explanationJson, null, 2)}

Return only the JSON puzzle object, no other text.`

  const response = await openai.chat.completions.create({
    model: 'gpt-5-mini',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ],
    response_format: { type: 'json_object' },
  })

  const content = response.choices[0]?.message.content
  if (!content) throw new Error('Empty response from model')

  const parsed = JSON.parse(content) as ParsewordsPuzzle
  return parsed
}
