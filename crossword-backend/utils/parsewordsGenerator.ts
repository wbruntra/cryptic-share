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

export type CrypticType =
  | 'anagram' | 'synonym' | 'reversal' | 'trim' | 'container'
  | 'hidden' | 'homophone' | 'initials' | 'charade' | 'definition'

export type TriggerAction =
  | { kind: 'replace'; options: string[]; label?: CrypticType }
  | { kind: 'result'; options: string[]; label?: CrypticType }
  | { kind: 'compute'; fn: 'trim-last' | 'trim-first' | 'reverse'; source: string; label?: CrypticType }
  | { kind: 'container'; label?: CrypticType }

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
  analysis?: {
    correct_path_steps: string[]
    red_herring_opportunities: { token_or_phrase: string; concept: string }[]
  }
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

const SYSTEM_PROMPT = `You are an expert at converting cryptic crossword clue explanations into highly engaging, challenging, and interactive puzzle definitions for a word game called Parsewords.

## The Parsewords game

The player sees the clue words as clickable tokens. They click tokens (one or several at a time) to discover operations that gradually reduce the clue to the answer. The goal is to consume all non-definition tokens into the answer string, leaving only the definition tokens and the answer token.

A great Parsewords puzzle MUST be challenging. In a real cryptic crossword, a solver does not know which word is the definition, which is an indicator, which is a fodder word, or how they combine. To simulate this mystery, **your puzzle must contain multiple layers of misleading "red herrings" (dead-ends)**. If a player blindly clicks words, treats indicators as synonyms, or chooses wrong synonyms, they should be led down plausible false paths that eventually get stuck!

## Misleading "Red Herrings" Strategy (Critical Requirement)

To make the puzzle challenging, you must systematically analyze every single word or combination of words in the clue and identify opportunities to throw in misleading clues (red herrings) to make it harder. Include the following types of red herrings:

1. **Indicator Role Confusion (Literal Swaps)**:
   - *Concept*: In a cryptic crossword, players must determine whether a word is an indicator (e.g., reversal, anagram, trim) or literal wordplay/fodder.
   - *Implementation*: For indicator words (e.g., "nearly", "frustrated", "about", "back"), add a \`replace\` trigger that swaps the word with literal synonyms (e.g., "nearly" -> ["ALMOST", "CLOSELY"], "frustrated" -> ["ANNOYED", "ANGRY"]). If the player chooses one of these synonyms, they lose the ability to use the token as an indicator in subsequent compute/result triggers, leading to a dead end!

2. **Filler / Link Word Distractors**:
   - *Concept*: Players might think link/connecting words (e.g., "for", "and", "in", "gives") are part of the wordplay or definition.
   - *Implementation*: Add a \`replace\` trigger for link words that swaps them with plausible synonyms (e.g., "for" -> ["PRO", "TO"], "gives" -> ["YIELDS", "PROVIDES"]). These lead to dead ends since no other triggers will match these replacement words.

3. **Fodder / Wordplay Synonym Dead Ends**:
   - *Concept*: When a wordplay token requires a synonym replacement (e.g., "Christmas" -> "YULE" in the correct path), you must provide highly plausible alternative synonyms as red herrings (e.g., "NOEL", "XMAS") that are NOT used in subsequent triggers.
   - *Implementation*: Inside the correct \`replace\` trigger's \`options\`, place the correct synonym first, followed by at least 2-3 genuine, highly plausible synonyms. Selecting any of the wrong synonyms will leave the player stuck.

4. **False Cryptic Operations**:
   - *Concept*: If a wordplay word or fodder looks like it *could* be reversed, trimmed, or anagrammed, add a trigger for that false operation.
   - *Implementation*: For example, if a token is "dump", add a \`compute\` reversal trigger: match: "dump back", action: compute reverse -> "PMUD". Even though this is not part of the correct path, it tempts the player to try it.

5. **Definition Red Herrings (Mandatory)**:
   - *Concept*: Provide synonyms for the definition token(s) that are plausible, but do not contain or lead to the correct answer.
   - *Implementation*: Add a \`replace\` trigger for the definition token(s) at the very end of the triggers array. Options must be genuine synonyms of the definition, but **must NEVER include the actual answer itself**.

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

### label (required on all triggers)

Every trigger action **must** include a \`label\` field naming the cryptic device:

- \`"anagram"\` — letters of the fodder are rearranged (typically \`result\` kind)
- \`"synonym"\` — a word is swapped for a definition synonym (typically \`replace\` kind)
- \`"reversal"\` — letters are reversed (\`compute\` with \`reverse\`, or \`result\`)
- \`"trim"\` — a letter is removed from start or end (\`compute\` with \`trim-first\`/\`trim-last\`)
- \`"container"\` — one string is inserted inside another (\`container\` kind)
- \`"hidden"\` — the answer is hidden within consecutive letters (\`result\` kind)
- \`"homophone"\` — the answer sounds like a word (\`result\` kind)
- \`"initials"\` — first letters are taken (\`result\` kind)
- \`"charade"\` — two independently derived fragments are concatenated (final \`result\` join trigger)
- \`"definition"\` — the definition red-herring trigger at the end of the array

A single \`match\` string may appear in **two separate triggers** when the same selection could represent two different cryptic operations (e.g. a word that could be read as either an anagram or a synonym). Give each its own trigger entry with a different \`label\` and \`options\`.

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

## Required Chain-of-Thought (The \`analysis\` Field)

To ensure the correct path is perfectly solvable and that the red herrings are highly challenging, you must perform a step-by-step audit of the clue before generating the tokens and triggers.
You **must** include an \`"analysis"\` field at the very beginning of your JSON output. This field must be structured as follows:
- \`"correct_path_steps"\`: A step-by-step description of the exact sequence of trigger matches and actions that the player must perform to solve the puzzle.
- \`"red_herring_opportunities"\`: A list of objects, each containing:
  - \`"token_or_phrase"\`: The specific word or adjacent words in the clue.
  - \`"concept"\`: A detailed explanation of how this word/phrase is utilized as a red herring (e.g. "We provide literal synonyms for 'frustrated' like ANNOYED or ANGRY to mislead players into treating it as wordplay rather than an anagram indicator").

## Trigger ordering (required)

**Put solution triggers first, red herring triggers next, definition red herrings last.**

The triggers array must be ordered so that the correct solution path comes first. All misleading red herring triggers (indicator swaps, link word swaps, false operations) must follow. The definition red herring(s) must be appended at the very end of the array.

This ordering is used by automated validation to verify the puzzle is solvable.

## Output format

Return a single JSON object with this exact shape:
\`\`\`json
{
  "analysis": {
    "correct_path_steps": [
      "Step 1: Description of correct action 1",
      "Step 2: Description of correct action 2",
      ...
    ],
    "red_herring_opportunities": [
      { "token_or_phrase": "Word", "concept": "Explanation of how it misleads the player" },
      ...
    ]
  },
  "label": "ANSWER",
  "clue": "original clue text",
  "answer": "ANSWER",
  "displayAnswer": "ANSWER WITH SPACES (omit if single word)",
  "tokens": [
    { "text": "Word", "role": "definition|wordplay|indicator|link" },
    ...
  ],
  "triggers": [
    { "match": "text1 text2", "action": { "kind": "replace|result|compute|container", "label": "anagram|synonym|...", ... } },
    ...
  ]
}
\`\`\`

## Example puzzle (TROUNCE — anagram + indicator and fodder red herrings)

Clue: "Beat counter, frustrated (7)"
Answer: TROUNCE

\`\`\`json
{
  "analysis": {
    "correct_path_steps": [
      "Step 1: Anagram 'counter,' (wordplay fodder) signaled by 'frustrated' (anagram indicator) to yield the correct answer 'TROUNCE'."
    ],
    "red_herring_opportunities": [
      {
        "token_or_phrase": "frustrated",
        "concept": "Mislead player into treating 'frustrated' as literal wordplay (synonyms ANNOYED/ANGRY) rather than an anagram indicator, leading to a dead end."
      },
      {
        "token_or_phrase": "counter,",
        "concept": "Mislead player into treating 'counter,' as a synonym swap (SHOP-DESK/REBUT) rather than rearranging its letters, leading to a dead end."
      },
      {
        "token_or_phrase": "Beat",
        "concept": "Definition red herring: provide synonyms for the definition 'Beat' (DEFEAT/THRASH/PUMMEL) which do not lead to the answer."
      }
    ]
  },
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
      "action": { "kind": "result", "label": "anagram", "options": ["TROUNCE", "RECOUNT", "CORNUTE"] }
    },
    {
      "match": "frustrated",
      "action": { "kind": "replace", "label": "synonym", "options": ["ANNOYED", "ANGRY", "STYMIED"] }
    },
    {
      "match": "counter,",
      "action": { "kind": "replace", "label": "synonym", "options": ["SHOP-DESK", "REBUT", "OPPOSE"] }
    },
    {
      "match": "Beat",
      "action": { "kind": "replace", "label": "definition", "options": ["DEFEAT", "THRASH", "PUMMEL"] }
    }
  ]
}
\`\`\`

## Example puzzle (LULLABY — deletion + reversals + container + multi-tier red herrings)

Clue: "With Christmas nearly over recall dance's sleepy tune (7)"
Answer: LULLABY

\`\`\`json
{
  "analysis": {
    "correct_path_steps": [
      "Step 1: Replace 'Christmas' with synonym 'YULE'.",
      "Step 2: Replace 'dance's' with synonym 'BALL'.",
      "Step 3: Trim the last letter of 'YULE' using 'nearly' (trim-last) to get 'YUL'.",
      "Step 4: Reverse 'YUL' using 'over' (reversal) to get 'LUY'.",
      "Step 5: Reverse 'BALL' using 'recall' (reversal) to get 'LLAB'.",
      "Step 6: Insert 'LUY' inside 'LLAB' using 'With' (container) to get 'LULLABY'."
    ],
    "red_herring_opportunities": [
      {
        "token_or_phrase": "Christmas",
        "concept": "Provide alternate synonyms like NOEL or XMAS which lead to a dead end because subsequent triggers only accept YULE."
      },
      {
        "token_or_phrase": "dance's",
        "concept": "Provide alternate synonyms like WALTZ or JIVE which lead to a dead end because subsequent triggers only accept BALL."
      },
      {
        "token_or_phrase": "nearly",
        "concept": "Provide literal replace trigger for 'nearly' -> ['ALMOST', 'APPROXIMATELY'] to distract the player from using it as a trim indicator."
      },
      {
        "token_or_phrase": "over",
        "concept": "Provide literal replace trigger for 'over' -> ['FINISHED', 'ENDED'] to distract from its reversal indicator role."
      },
      {
        "token_or_phrase": "sleepy tune",
        "concept": "Definition red herring: replace definition phrase 'sleepy tune' with CRADLE SONG/SERENADE/NOCTURNE which lead nowhere."
      }
    ]
  },
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
    { "match": "Christmas", "action": { "kind": "replace", "label": "synonym", "options": ["YULE", "NOEL", "XMAS"] } },
    { "match": "dance's", "action": { "kind": "replace", "label": "synonym", "options": ["BALL", "WALTZ", "JIVE"] } },
    { "match": "YULE nearly", "action": { "kind": "compute", "label": "trim", "fn": "trim-last", "source": "YULE" } },
    { "match": "YUL over", "action": { "kind": "compute", "label": "reversal", "fn": "reverse", "source": "YUL" } },
    { "match": "BALL recall", "action": { "kind": "compute", "label": "reversal", "fn": "reverse", "source": "BALL" } },
    { "match": "With LUY LLAB", "action": { "kind": "container", "label": "container" } },
    { "match": "nearly", "action": { "kind": "replace", "label": "synonym", "options": ["ALMOST", "APPROXIMATELY", "CLOSELY"] } },
    { "match": "over", "action": { "kind": "replace", "label": "synonym", "options": ["FINISHED", "ENDED", "ABOVE"] } },
    { "match": "recall", "action": { "kind": "replace", "label": "synonym", "options": ["REMEMBER", "REMEMBRANCE", "EVOKE"] } },
    { "match": "sleepy tune", "action": { "kind": "replace", "label": "definition", "options": ["CRADLE SONG", "SERENADE", "NOCTURNE"] } }
  ]
}
\`\`\`

## Example puzzle (IMPOUND — abbreviation + anagram + concatenation + red herrings)

Clue: "Seize first person playing on dump (7)"
Answer: IMPOUND

\`\`\`json
{
  "analysis": {
    "correct_path_steps": [
      "Step 1: Take first letter of 'person' to get 'I' (abbreviation).",
      "Step 2: Anagram 'on dump' using 'playing' (anagram) to get 'MPOUND'.",
      "Step 3: Concatenate 'I' and 'MPOUND' (charade) to form 'IMPOUND'."
    ],
    "red_herring_opportunities": [
      {
        "token_or_phrase": "first person",
        "concept": "Include incorrect initials like ME or HE to mislead players."
      },
      {
        "token_or_phrase": "playing",
        "concept": "Provide literal synonyms for 'playing' -> ['PERFORMING', 'ACTING'] to distract from its anagram indicator role."
      },
      {
        "token_or_phrase": "Seize",
        "concept": "Definition red herring: provide synonyms for the definition 'Seize' (CONFISCATE/CAPTURE/GRAB) that lead to a dead end."
      }
    ]
  },
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
    { "match": "first person", "action": { "kind": "result", "label": "initials", "options": ["I", "ME", "HE"] } },
    { "match": "on dump playing", "action": { "kind": "result", "label": "anagram", "options": ["MPOUND", "DUNPOM", "PONDMU"] } },
    { "match": "I MPOUND", "action": { "kind": "result", "label": "charade", "options": ["IMPOUND", "IMOPUND", "MIPOUND"] } },
    { "match": "playing", "action": { "kind": "replace", "label": "synonym", "options": ["PERFORMING", "ACTING", "TOYING"] } },
    { "match": "Seize", "action": { "kind": "replace", "label": "definition", "options": ["CONFISCATE", "CAPTURE", "GRAB"] } }
  ]
}
\`\`\`

Note: the triggers array strictly places correct solution path triggers first, then misleading red herrings (like 'playing' -> PERFORMING), and finally the definition red herring ('Seize' -> CONFISCATE).
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
