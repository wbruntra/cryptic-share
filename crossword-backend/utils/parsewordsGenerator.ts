/**
 * Generates a Parsewords mini-game puzzle from a cryptic clue explanation.
 *
 * Pipeline:
 *   1. Build a deterministic SKELETON from the verified explanation
 *      (buildSkeletonFromExplanation) — the single correct solution path,
 *      one correct option per choice. No LLM, guaranteed solvable.
 *   2. Ask an LLM to ENHANCE the skeleton: add plausible wrong options and
 *      red-herring (dead-end) triggers, without touching the correct path.
 *   3. BFS-validate the enhanced puzzle; if the LLM broke it, fall back to the
 *      bare skeleton (which is always solvable).
 */

import { OpenRouter } from '@openrouter/sdk'
import { OPENROUTER_MODELS } from '../config'
import { buildSkeletonFromExplanation } from './parsewordsSkeleton'
import { validatePuzzle } from './parsewordsSolver'

const client = new OpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
})

export const models = OPENROUTER_MODELS

const DEFAULT_MODEL = models['deepseek-pro']

// ---------------------------------------------------------------------------
// Schema (mirrors parsewords frontend types — keep in sync)
// ---------------------------------------------------------------------------

export type TokenRole = 'definition' | 'wordplay' | 'indicator' | 'link'

export type CrypticType =
  | 'anagram' | 'synonym' | 'reversal' | 'trim' | 'deletion' | 'container'
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
// Enhancement prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You enhance Parsewords puzzles. You are given a SKELETON puzzle that already contains the single correct solution path — every choice currently has only its one correct option. Your job is to make the puzzle challenging by adding plausible WRONG options and red-herring (dead-end) triggers, WITHOUT breaking the correct path.

## How Parsewords works
The player sees the clue as clickable word tokens. Selecting a contiguous group of tokens whose joined text equals a trigger's "match" fires that trigger:
- replace: one token's text is swapped for an option the player picks (synonyms, abbreviations).
- result: several tokens combine into one new token the player picks (anagram, charade, hidden, etc.).
- compute: a deterministic single-token operation (trim/reverse) — no options.
- container: insert one resolved letter-string into another — no options.
The player wins when the only remaining non-definition, non-link token equals the answer. A "dead end" is any option/trigger whose result cannot lead to the answer.

## ABSOLUTE RULES — never break the correct path
- Return the puzzle with "label", "clue", "answer", "displayAnswer", and "tokens" COPIED EXACTLY from the input. Never change token text or roles.
- Keep EVERY existing trigger, in the same order. For each existing replace/result trigger, its FIRST option is the correct one and MUST stay first and unchanged.
- Do NOT modify "compute" or "container" triggers at all (they have no options).
- You may ONLY: (a) append extra options after the correct one on existing replace/result triggers, and (b) append brand-new red-herring triggers at the end. Never reorder or delete anything.

## Adding wrong options to existing replace triggers
For each existing "replace" trigger, add 1-2 wrong options AFTER the correct first option:
- They must be GENUINE — real synonyms of the clue word, or real alternative abbreviations a solver might actually try.
- A SYNONYM replace (the clue word maps to a whole word, e.g. "grow older" -> AGE) almost always has other real synonyms — add 1-2 (e.g. AGE plus MATURE, RIPEN). Default to adding distractors here.
- An ABBREVIATION replace (the clue word maps to one or two letters, e.g. "women" -> W, "right" -> R) often has only one standard abbreviation. Add another ONLY if a real alternative abbreviation exists; otherwise leave just the correct option.
- CRITICAL: never invent fake or nonsense words just to reach a count. Quality over quantity. One real option beats three with junk.
- Wrong options must be dead ends: they must not equal the text any other trigger matches on.
- Letter-string options (abbreviations, fodder) should be ALL CAPS, matching the style of the correct option.

## Adding wrong options to existing result triggers
For each existing "result" trigger, add 1-2 wrong options AFTER the correct one:
- For anagrams: other plausible arrangements of the SAME letters (these are not "invented words", so they are fine).
- For charades/concatenations/hidden/etc.: a wrong ordering or a near-miss of the same letters.
- All wrong options must be dead ends.

## Adding red-herring triggers (new dead-end triggers)
Append NEW triggers that tempt the solver onto false paths. Add them only where they make genuine cryptic sense — do NOT force one onto every token. Every red herring must be a dead end (its result enables no further progress), and must use only REAL words/abbreviations (no junk).
1. Indicator role confusion: for an indicator word, add a "replace" (label "synonym") giving a real literal synonym (e.g. "back" -> ["REAR"], "frustrated" -> ["ANNOYED"]). A solver who treats the indicator as fodder gets stuck.
2. Link/filler distractor: for a link word, add a "replace" (label "synonym") with a real synonym (e.g. "for" -> ["PRO"]).
3. Definition red herring (include one when there is a clear definition): add a "replace" (label "definition") on the definition token(s) with REAL synonyms of the definition. They must NOT equal the answer, and must NOT contain or be a fragment of the answer.
4. False operation (optional): if a wordplay token plausibly looks reversible/trimmable, add a wrong "compute" trigger (label "reversal" or "trim").

## label values (strict)
Every trigger's "label" MUST be exactly one of: anagram, synonym, reversal, trim, deletion, container, hidden, homophone, initials, charade, definition. NEVER invent a label such as "distractor" or "red-herring". Red-herring synonym swaps use label "synonym"; definition red herrings use label "definition".

## Ordering
Keep all original correct-path triggers first (unchanged order). Then append red-herring triggers. Put definition red herrings last.

## Output
Return ONLY the puzzle JSON object with this shape (no commentary):
{ "label": "...", "clue": "...", "answer": "...", "displayAnswer": "...", "tokens": [...], "triggers": [...] }
"tokens" and the leading correct triggers must be identical to the input; you are only adding options and trailing triggers.`

// ---------------------------------------------------------------------------
// Core: enhance a skeleton with red herrings
// ---------------------------------------------------------------------------

export async function enhanceSkeletonPuzzle(
  skeleton: ParsewordsPuzzle,
  model = DEFAULT_MODEL,
): Promise<ParsewordsPuzzle> {
  const userMessage = `Here is the SKELETON Parsewords puzzle (correct path only). Enhance it with genuine wrong options and red herrings per the rules. Keep the correct path intact.

${JSON.stringify(skeleton, null, 2)}

Return only the enhanced JSON puzzle object, no other text.`

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
  return sanitizeLabels(parsed)
}

const VALID_LABELS = new Set<CrypticType>([
  'anagram', 'synonym', 'reversal', 'trim', 'deletion', 'container',
  'hidden', 'homophone', 'initials', 'charade', 'definition',
])

/**
 * Coerce any invalid/invented trigger label (e.g. "distractor") to a sensible
 * value so the frontend's CRYPTIC_DISPLAY lookup never gets junk.
 */
function sanitizeLabels(puzzle: ParsewordsPuzzle): ParsewordsPuzzle {
  for (const trigger of puzzle.triggers ?? []) {
    const action = trigger.action
    if (action.label && !VALID_LABELS.has(action.label)) {
      action.label =
        action.kind === 'replace' ? 'synonym'
        : action.kind === 'container' ? 'container'
        : action.kind === 'compute' ? (action.fn === 'reverse' ? 'reversal' : 'trim')
        : 'charade'
    }
  }
  return puzzle
}

// ---------------------------------------------------------------------------
// Convenience: explanation -> skeleton -> enhanced (with safe fallback)
// ---------------------------------------------------------------------------

export async function generateParsewordsPuzzle(
  clueText: string,
  answer: string,
  explanationJson: unknown,
  model = DEFAULT_MODEL,
): Promise<ParsewordsPuzzle> {
  // 1. Deterministic skeleton (guaranteed correct path)
  const skeleton = buildSkeletonFromExplanation(
    explanationJson as Record<string, unknown>,
    clueText,
    answer,
  )
  if (!skeleton) {
    throw new Error('Could not build a Parsewords skeleton from this explanation')
  }

  const skeletonCheck = validatePuzzle(skeleton)
  if (!skeletonCheck.solvable) {
    throw new Error(`Skeleton is not solvable: ${skeletonCheck.reason}`)
  }

  // 2. LLM enhancement
  let enhanced: ParsewordsPuzzle
  try {
    enhanced = await enhanceSkeletonPuzzle(skeleton, model)
  } catch (err) {
    // If the model call/parse fails, the bare skeleton is still a valid puzzle.
    return skeleton
  }

  // 3. Safety net: the enhanced puzzle must still be solvable, otherwise the
  // LLM broke the correct path — fall back to the guaranteed-good skeleton.
  const enhancedCheck = validatePuzzle(enhanced)
  if (!enhancedCheck.solvable) {
    return skeleton
  }

  return enhanced
}

// ---------------------------------------------------------------------------
// CLI: build + enhance a single clue explanation by id
// ---------------------------------------------------------------------------

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

  const skeleton = buildSkeletonFromExplanation(explanation, row.clue_text, row.answer)
  if (skeleton) {
    console.log('Skeleton (correct path only):')
    console.log(JSON.stringify(skeleton, null, 2))
    console.log()
  }

  const start = performance.now()
  const result = await generateParsewordsPuzzle(row.clue_text, row.answer, explanation, modelSlug)
  const elapsed = ((performance.now() - start) / 1000).toFixed(2)

  console.log('Enhanced puzzle:')
  console.log(JSON.stringify(result, null, 2))
  console.log(`\nResponse time: ${elapsed}s`)

  await db.destroy()
}
