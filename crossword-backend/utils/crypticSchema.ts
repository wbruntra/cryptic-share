import { z } from 'zod'
import { zodTextFormat } from 'openai/helpers/zod'

// =========================
// ZOD SCHEMA DEFINITIONS
// =========================

const ClueTokenSchema = z
  .object({
    text: z
      .string()
      .describe(
        'A single word token verbatim from the clue. Strip all punctuation (commas, periods, dashes, question marks, exclamation marks) — never include punctuation-only tokens.',
      ),
    role: z
      .enum(['definition', 'wordplay', 'indicator', 'link'])
      .describe(
        'The role of this token in the clue structure.',
      ),
  })
  .strict()

const WordplayStepSchema = z
  .object({
    tokens: z
      .string()
      .describe(
        'The exact contiguous span of clue text consumed in this step (e.g. "Christmas" or "YULE nearly"). Must be a verbatim substring of the current clue state — no skipping words.',
      ),
    operation: z
      .enum([
        'synonym',      // replace a word with its synonym (e.g. "old" → "EX")
        'abbreviate',   // replace a word with its standard abbreviation (e.g. "right" → "R", "women" → "W")
        'literal',      // use the word's own letters verbatim (e.g. "Do" → "DO")
        'translation',  // translate to/from another language (e.g. "the French" → "LE", "German article" → "DER")
        'anagram',      // rearrange all letters of the fodder (indicator consumed with fodder)
        'reversal',     // reverse the letter string (indicator consumed with token)
        'trim',         // delete one letter from start or end only (indicator consumed with token)
        'delete',       // remove specified letters from elsewhere, e.g. "H" from THREE → TREE (indicator + removed letters consumed)
        'concatenate',  // join two or more adjacent already-resolved fragments into one
        'container',    // insert one fragment inside another (indicator consumed with both fragments)
        'hidden',       // extract letters hidden consecutively inside the tokens
        'homophone',    // take the sound-alike of a word (indicator consumed with word)
        'initials',     // take the first letter of each word (indicator consumed with words)
      ])
      .describe('The cryptic operation performed in this step'),
    result: z.string().describe('Resulting letter string after the operation'),
    clue_after: z
      .string()
      .describe(
        'The clue with the consumed tokens replaced by the result, showing the clue state after this step',
      ),
  })
  .strict()

// Standard wordplay clue
const WordplayExplanationSchema = z
  .object({
    clue_type: z.literal('wordplay'),
    clue_segmentation: z
      .array(ClueTokenSchema)
      .min(1)
      .describe('Verbatim word-by-word token segmentation of the entire clue, assigning EVERY word its exact role.'),
    definition: z.string().describe('The exact definition from the clue'),
    wordplay_steps: z.array(WordplayStepSchema).min(1),
    hint: z
      .object({
        definition_location: z.enum(['start', 'end']),
        wordplay_types: z.array(z.string()).min(1),
      })
      .strict(),
    full_explanation: z.string(),
  })
  .strict()

// Double definition clue
const DoubleDefinitionExplanationSchema = z
  .object({
    clue_type: z.literal('double_definition'),
    clue_segmentation: z
      .array(ClueTokenSchema)
      .min(1)
      .describe('Verbatim word-by-word token segmentation of the entire clue, assigning EVERY word its exact role.'),
    definitions: z
      .array(
        z
          .object({
            definition: z.string(),
            sense: z.string(),
          })
          .strict(),
      )
      .min(2),
    hint: z
      .object({
        definition_count: z.literal(2),
      })
      .strict(),
    full_explanation: z.string(),
  })
  .strict()

// &lit clue
const AndLitExplanationSchema = z
  .object({
    clue_type: z.literal('&lit'),
    definition_scope: z.literal('entire_clue'),
    clue_segmentation: z
      .array(ClueTokenSchema)
      .min(1)
      .describe('Verbatim word-by-word token segmentation of the entire clue, assigning EVERY word its exact role.'),
    wordplay_steps: z.array(WordplayStepSchema).min(1),
    hint: z
      .object({
        wordplay_types: z.array(z.string()).min(1),
      })
      .strict(),
    full_explanation: z.string(),
  })
  .strict()

// Cryptic definition clue
const CrypticDefinitionExplanationSchema = z
  .object({
    clue_type: z.literal('cryptic_definition'),
    definition_scope: z.literal('entire_clue'),
    clue_segmentation: z
      .array(ClueTokenSchema)
      .min(1)
      .describe('Verbatim word-by-word token segmentation of the entire clue, assigning EVERY word its exact role.'),
    definition_paraphrase: z
      .string()
      .describe(
        'A concise paraphrase of what the whole clue is defining (no wordplay decomposition)',
      ),
    hint: z
      .object({
        definition_scope: z.literal('entire_clue'),
      })
      .strict(),
    full_explanation: z.string(),
  })
  .strict()

// No clean parse
const NoCleanParseExplanationSchema = z
  .object({
    clue_type: z.literal('no_clean_parse'),
    intended_clue_type: z
      .enum(['wordplay', 'double_definition', '&lit', 'cryptic_definition'])
      .describe('Best-guess clue type if the clue were clued cleanly'),
    clue_segmentation: z
      .array(ClueTokenSchema)
      .min(1)
      .describe('Verbatim word-by-word token segmentation of the entire clue, assigning EVERY word its exact role.'),
    definition: z.string().describe('The exact definition from the clue (best guess)'),
    issue: z
      .string()
      .describe(
        'Precise reason a clean parse is not possible (missing indicator, letter accounting mismatch, etc.)',
      ),
    hint: z
      .object({
        intended_clue_type: z.enum(['wordplay', 'double_definition', '&lit', 'cryptic_definition']),
      })
      .strict(),
    full_explanation: z.string(),
  })
  .strict()

// Discriminated union for all explanation types
// switched to z.union to produce 'anyOf' for OpenAI compatibility
export const ExplanationSchema = z.union([
  WordplayExplanationSchema,
  DoubleDefinitionExplanationSchema,
  AndLitExplanationSchema,
  CrypticDefinitionExplanationSchema,
  NoCleanParseExplanationSchema,
])

// Top-level cryptic explanation schema with refinement to ensure consistency
export const CrypticExplanationZodSchema = z
  .object({
    clue_type: z.enum([
      'wordplay',
      'double_definition',
      '&lit',
      'cryptic_definition',
      'no_clean_parse',
    ]),
    explanation: ExplanationSchema,
  })
  .strict()
  .refine((data) => data.clue_type === data.explanation.clue_type, {
    message: 'Top-level clue_type must match explanation.clue_type',
    path: ['clue_type'],
  })

// Convert to JSON Schema for OpenAI API
const crypticJsonSchema = z.toJSONSchema(CrypticExplanationZodSchema)

// Export the JSON Schema format for OpenAI API (Zod version)
export const crypticSchemaFromZod = {
  type: 'json_schema',
  name: 'cryptic_explanation_zod',
  strict: true,
  schema: crypticJsonSchema,
}

export const openaiCrypticSchema = zodTextFormat(CrypticExplanationZodSchema, 'cryptic_explanation')

// Type inference
export type CrypticExplanation = z.infer<typeof CrypticExplanationZodSchema>
export type WordplayExplanation = z.infer<typeof WordplayExplanationSchema>
export type DoubleDefinitionExplanation = z.infer<typeof DoubleDefinitionExplanationSchema>
export type AndLitExplanation = z.infer<typeof AndLitExplanationSchema>
export type CrypticDefinitionExplanation = z.infer<typeof CrypticDefinitionExplanationSchema>
export type NoCleanParseExplanation = z.infer<typeof NoCleanParseExplanationSchema>

// =========================
// ORIGINAL JSON SCHEMA (PRESERVED)
// =========================

export const crypticInstructions = `
You are a cryptic crossword expert explaining a solved clue.

You will be given:
- A cryptic crossword clue
- The correct answer

Your task:
1. Perform a verbatim, word-by-word token segmentation of the entire clue in the clue_segmentation array.
   Every single word in the clue MUST be represented as a token in the exact order they appear, with no words omitted or skipped.
   Note on punctuation: All punctuation (commas, periods, dashes, question marks, exclamation marks) is surface noise. Do not create separate tokens for punctuation-only characters. Strip punctuation from word tokens (e.g. "right," becomes "right", "Lady?" becomes "Lady").
   Assign exactly one role to each token:
   - "definition": words that belong to the definition part of the clue.
   - "wordplay": words that contribute letters or fodder or act as synonym/abbreviation sources.
   - "indicator": words that signal a cryptic operation (anagram, reversal, insertion, deletion, hidden-word, etc.).
   - "link": connecting words or filler phrases that link the definition and the wordplay, or join wordplay parts, but perform no cryptic operations and contribute no letters to the answer (e.g. "and", "for", "gives", "can be", "is", "from", "to", "with", "a", "an", "the"). Use this role for any word that serves as surface glue and does not directly participate in a cryptic operation or definition.
2. Identify the clue type: wordplay (standard cryptic with definition + wordplay), double_definition, &lit (entire clue serves as both definition and wordplay), or cryptic_definition (no separable wordplay; the whole clue is a single misleading definition).
   If (and only if) you cannot produce a clean parse without inventing indicators or forcing letter accounting, set clue_type to no_clean_parse.
3. For wordplay clues: Identify the exact definition in the clue (quote it verbatim).
4. For &lit clues: Note that the entire clue is the definition, and provide the wordplay parse.
5. For double_definition clues: Identify both definitions and their distinct senses.
6. For cryptic_definition clues: Provide a concise paraphrase of the whole-clue definition; do not invent wordplay.
7. Provide both a hint and a full explanation appropriate to the clue type.

Role-guided wordplay steps (CRITICAL):
- Wordplay steps must strictly respect the token roles assigned in clue_segmentation.
- You must NOT select/consume a "definition" or a "link" word as part of a wordplay operation (e.g. attempting to find synonyms for them or drop them in a synonym/reversal step).
- "link" words are completely ignored by wordplay steps and must remain completely untouched in the clue_after text.
- If two resolved wordplay fragments need to be joined, use a simple "concatenate" operation on ONLY those adjacent wordplay fragments (e.g. tokens="LONG BOW" -> result="LONGBOW"), leaving the untouched "link" and "definition" words unchanged in clue_after (e.g. clue_after="LONGBOW for medieval weapon").
- Indicator words are consumed alongside the wordplay words they govern (e.g. "YULE nearly" as "YULE" + trim indicator "nearly"), NOT as a separate step.
- For abbreviation/synonym steps with no indicator, use only the wordplay word being replaced.

Core cryptic rules (strict):
- For wordplay and &lit clues: Each part of the wordplay MUST correspond to one explicit indicator in the clue.
- Use the simplest valid parse; do not offer alternatives or supporting interpretations.
- Do NOT mix mechanisms (e.g. hidden letters, charades, containers) unless the clue explicitly indicates them.
- For wordplay and &lit clues: Every letter in the answer MUST be explicitly justified.
- Compound Anagram Logic (Priority Check):
  If a standard parse fails, before determining that there is no clean parse possible, you must specifically check for "Answer-Participating" anagrams. Test this algebraic relationship: "(Visible Clue Part A + Answer) = Visible Clue Part B".
  1. Identify the Target (Part B) and the Remainder (Part A) in the clue.
  2. Identify the Indicator (e.g., "makes", "dressed as", "becomes", "is", "forms").
  3. Verify: Does "Anagram(Part A + Answer)" exactly equal "Part B"?
  4. If yes, this IS a valid parse - accept it immediately. Do not invent additional requirements or reasons to reject it. The definition is the part of the clue not involved in the algebra.
  CRITICAL: If the algebraic relationship holds perfectly (all letters accounted for), you MUST accept it as valid wordplay. Do not reject it for contiguity concerns, word boundaries, or any other reason. A valid compound anagram is a complete and correct parse.
- For cryptic_definition clues: Do NOT fabricate indicators, letter breakdowns, or wordplay steps.
- Do not invent extra indicators, padding, or explanatory glue.
- If a clean parse cannot be produced, state that the clue is loose or flawed rather than inventing one.

No-clean-parse handling:
- If a clean parse cannot be produced, return clue_type: no_clean_parse.
- Provide intended_clue_type as your best guess among: wordplay, double_definition, &lit, cryptic_definition.
- Provide the exact definition from the clue, since usually this can be identified knowing the answer and taking part of the clue, even if the wordplay element is not understood.
- In issue, state the precise reason you cannot parse cleanly (e.g. missing indicator, letter accounting mismatch).
- Do NOT fabricate letter breakdowns, indicators, or wordplay steps in this mode.

Wordplay steps — token-consumption model (mandatory for wordplay and &lit clues):
Each step must show exactly how the clue is being reduced, one operation at a time, until only the answer and definition remain. Think of each step as a player action: the player selects one or more adjacent clue words, performs an operation, and those words are replaced by the result.

Each step has four fields:
- tokens: a single string — the exact contiguous span of clue text selected and consumed (e.g. “Christmas” or “YULE nearly”). It must be a verbatim substring of the current clue state; you cannot skip over words.
- operation: MUST be exactly one of the allowed enum values:
    synonym      — replace a word with its synonym (e.g. “old” → “EX”)
    abbreviate   — replace with a standard abbreviation (e.g. “right” → “R”, “women” → “W”)
    literal      — use the word's own letters verbatim (e.g. “Do” → “DO”)
    translation  — translate to/from another language (e.g. “the French” → “LE”)
    anagram      — rearrange letters; include the indicator in tokens
    reversal     — reverse letters; include the indicator in tokens
    trim         — delete ONE letter from the start or end only; include the indicator in tokens
    delete       — remove specified letters from somewhere OTHER than just the start/end (e.g. remove "H" from THREE → TREE, remove "MOD" from SUPERMODEL → SUPEREL); include the indicator and the letters being removed in tokens
    concatenate  — join two or more already-resolved fragments; no separate indicator
    container    — insert one already-resolved fragment inside another; include indicator and both fragments in tokens
    hidden       — extract letters hidden inside tokens; include the indicator
    homophone    — take the sound-alike; include the indicator
    initials     — take first letters; include the indicator
- result: the letter string produced
- clue_after: the full clue text after replacing the consumed tokens with the result

Example for “With Christmas nearly over recall dance's sleepy tune (7)” → LULLABY:
Step 1: tokens=”Christmas”, operation=”synonym”, result=”YULE”, clue_after=”With YULE nearly over recall dance's sleepy tune”
Step 2: tokens=”YULE nearly”, operation=”trim”, result=”YUL”, clue_after=”With YUL over recall dance's sleepy tune”
Step 3: tokens=”YUL over”, operation=”reversal”, result=”LUY”, clue_after=”With LUY recall dance's sleepy tune”
Step 4: tokens=”dance's”, operation=”synonym”, result=”BALL”, clue_after=”With LUY recall BALL sleepy tune”
Step 5: tokens=”BALL recall”, operation=”reversal”, result=”LLAB”, clue_after=”With LUY LLAB sleepy tune”
Step 6: tokens=”With LUY LLAB”, operation=”container”, result=”LULLABY”, clue_after=”LULLABY sleepy tune”

Rules:
- tokens must be a contiguous span — a verbatim substring of the current clue state. Never select words that are not adjacent to each other.
- Each step must reference the current clue state (tokens from previous steps may have been replaced).
- The final step must produce the answer, leaving the answer string alongside any untouched link and definition words.
- Indicator words are consumed alongside the wordplay words they govern (e.g. “nearly” is consumed with “YULE” as the span “YULE nearly”, not separately).
- For abbreviation/synonym steps with no indicator, use only the wordplay word being replaced.
- clue_after must reflect the actual clue string with substitutions applied; do not paraphrase.

ONE OPERATION PER STEP — ATOMICITY (CRITICAL):
Each step must perform EXACTLY ONE elementary operation. Never fold a synonym, abbreviation, or anagram into the same step as a container, deletion, or concatenation. Each step is replayed mechanically by software, so every transformation must be its own explicit step.

- A word needs its OWN resolution step ONLY when the letters it contributes differ from its plain spelling: synonyms (grow older → AGE), abbreviations (right → R, women → W), and symbol/number spell-outs (3 → THREE). Resolve every such word to its letters BEFORE it is used in a container, concatenate, or delete step.
- A word used LITERALLY — whose own letters are exactly what the answer uses (e.g. "Do" → DO) — does NOT need its own step. Do NOT emit no-op "literal" steps that merely uppercase a word. Instead, fold the literal word directly into the combining (concatenate/charade/container/delete) step; the operation consumes it in place. Link words ("by", "and", "for") are likewise dropped by being consumed inside the combining step's token span.
- Every abbreviation is its own step. WRONG: tokens="HOUS to entertain king", operation="container" (king is an abbreviation, still raw). RIGHT: first tokens="king", operation="abbreviate", result="R"; THEN tokens="HOUS to entertain R", operation="container", result="HOURS".
- Every synonym used as container/charade fodder is its own step. WRONG: tokens="project involving navy", operation="container" (project/navy are raw). RIGHT: tokens="project", operation="synonym", result="JUT"; tokens="navy", operation="abbreviate", result="N"; tokens="JUT involving N", operation="container", result="JUNT".
- Charade example folding in a literal word and dropping a link word — "Do women grow older by right" → DOWAGER: tokens="women", operation="abbreviate", result="W"; tokens="grow older", operation="synonym", result="AGE"; tokens="right", operation="abbreviate", result="R"; THEN tokens="Do W AGE by R", operation="concatenate", result="DOWAGER" (the literal "Do" is consumed as DO and the link word "by" is dropped in the same join). Do NOT add a "Do"→"DO" step.
- An anagram is its own step and may NOT be combined with a container. WRONG: tokens="IV enter sort of diner", operation="container". RIGHT: tokens="sort of diner", operation="anagram", result="DREIN"; THEN tokens="IV enter DREIN", operation="container", result="DRIVEIN". When the anagram intermediate must combine with another fragment, choose the specific anagram arrangement that makes the following step produce the answer.
- When anagram (or charade) fodder spans a link word, COMBINE the fodder into one token first (the combine step drops the link word), then operate on the combined token. Example for "Schweitzer and Lenin ordered" → WIENER SCHNITZEL: tokens="Schweitzer and Lenin", operation="concatenate", result="SCHWEITZERLENIN" (the link word "and" is dropped); THEN tokens="SCHWEITZERLENIN ordered", operation="anagram", result="WIENER SCHNITZEL".
- Deletion of letters from anywhere other than the very start/end uses operation="delete", and any letters being removed that are abbreviations/synonyms must already be resolved. Example for "Without Henry, 3" → TREE: tokens="Henry", operation="abbreviate", result="H"; tokens="3", operation="literal", result="THREE"; tokens="Without H THREE", operation="delete", result="TREE". (Here "3"→THREE is a genuine spell-out, not a no-op.)

Style constraints:
- Write like a crossword setter explaining a clue to another setter.
- Be concise and literal.
- Avoid hedging or justification language such as “also”, “alternatively”, “supported by”, or “equivalently”.
- Do not explain basic cryptic conventions unless necessary.

Output format:
Return ONLY valid JSON.

Final check (required):
- For wordplay and &lit clues: Verify that each step's clue_after correctly reflects the substitution.
- For double_definition clues: Verify that both definitions legitimately match the answer in different senses.
- For cryptic_definition clues: Verify that there is no separable wordplay and only a single whole-clue definition.

Constraints:
- full_explanation must be at most 4 sentences.
`

export const generateExplanationMessages = (
  clue: string,
  answer: string,
  mode: 'hint' | 'full' = 'full',
) => {
  return [
    {
      role: 'user',
      content: [
        { type: 'input_text', text: crypticInstructions },
        {
          type: 'input_text',
          text: `
Clue: ${clue}
Answer: ${answer}
      `.trim(),
        },
      ],
    },
  ]
}

export const crypticSchema = {
  type: 'json_schema',
  name: 'cryptic_explanation',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      clue_type: {
        type: 'string',
        enum: [
          'wordplay',
          'double_definition',
          '&lit',
          'cryptic_definition',
          'no_clean_parse',
        ],
        description: 'The structural type of the cryptic clue',
      },

      explanation: {
        anyOf: [
          // =========================
          // STANDARD WORDPLAY CLUE
          // =========================
          {
            type: 'object',
            description: 'A standard cryptic clue with definition and wordplay',
            properties: {
              clue_type: { type: 'string', const: 'wordplay' },

              clue_segmentation: {
                type: 'array',
                description: 'Verbatim word-by-word token segmentation of the entire clue. Every word must be represented; strip all punctuation from tokens and do not emit punctuation-only tokens.',
                minItems: 1,
                items: {
                  type: 'object',
                  properties: {
                    text: {
                      type: 'string',
                      description: 'A single word token from the clue (punctuation stripped; no punctuation-only tokens).'
                    },
                    role: {
                      type: 'string',
                      enum: ['definition', 'wordplay', 'indicator', 'link'],
                      description: 'The role of this token in the clue structure.'
                    }
                  },
                  required: ['text', 'role'],
                  additionalProperties: false
                }
              },

              definition: {
                type: 'string',
                description: 'The exact definition from the clue',
              },

              wordplay_steps: {
                type: 'array',
                minItems: 1,
                items: {
                  type: 'object',
                  properties: {
                    tokens: {
                      type: 'string',
                      description: 'Exact contiguous span of clue text consumed in this step — must be a verbatim substring of the current clue state',
                    },
                    operation: {
                      type: 'string',
                      enum: [
                        'synonym', 'abbreviate', 'literal', 'translation',
                        'anagram', 'reversal', 'trim', 'delete', 'concatenate',
                        'container', 'hidden', 'homophone', 'initials',
                      ],
                      description: 'The cryptic operation performed (must be one of the allowed values)',
                    },
                    result: {
                      type: 'string',
                      description: 'Resulting letter string after the operation',
                    },
                    clue_after: {
                      type: 'string',
                      description: 'The clue with consumed tokens replaced by the result',
                    },
                  },
                  required: ['tokens', 'operation', 'result', 'clue_after'],
                  additionalProperties: false,
                },
              },

              hint: {
                type: 'object',
                properties: {
                  definition_location: {
                    type: 'string',
                    enum: ['start', 'end'],
                  },
                  wordplay_types: {
                    type: 'array',
                    minItems: 1,
                    items: { type: 'string' },
                  },
                },
                required: ['definition_location', 'wordplay_types'],
                additionalProperties: false,
              },

              full_explanation: {
                type: 'string',
              },
            },
            required: [
              'clue_type',
              'clue_segmentation',
              'definition',
              'wordplay_steps',
              'hint',
              'full_explanation',
            ],
            additionalProperties: false,
          },

          // =========================
          // DOUBLE DEFINITION CLUE
          // =========================
          {
            type: 'object',
            description: 'A double definition clue',
            properties: {
              clue_type: { type: 'string', const: 'double_definition' },

              clue_segmentation: {
                type: 'array',
                description: 'Verbatim word-by-word token segmentation of the entire clue. Every word must be represented; strip all punctuation from tokens and do not emit punctuation-only tokens.',
                minItems: 1,
                items: {
                  type: 'object',
                  properties: {
                    text: {
                      type: 'string',
                      description: 'A single word token from the clue (punctuation stripped; no punctuation-only tokens).'
                    },
                    role: {
                      type: 'string',
                      enum: ['definition', 'wordplay', 'indicator', 'link'],
                      description: 'The role of this token in the clue structure.'
                    }
                  },
                  required: ['text', 'role'],
                  additionalProperties: false
                }
              },

              definitions: {
                type: 'array',
                minItems: 2,
                items: {
                  type: 'object',
                  properties: {
                    definition: { type: 'string' },
                    sense: { type: 'string' },
                  },
                  required: ['definition', 'sense'],
                  additionalProperties: false,
                },
              },

              hint: {
                type: 'object',
                properties: {
                  definition_count: { type: 'number', const: 2 },
                },
                required: ['definition_count'],
                additionalProperties: false,
              },

              full_explanation: {
                type: 'string',
              },
            },
            required: ['clue_type', 'clue_segmentation', 'definitions', 'hint', 'full_explanation'],
            additionalProperties: false,
          },

          // =========================
          // &LIT CLUE
          // =========================
          {
            type: 'object',
            description: 'An &lit clue where the entire clue is both definition and wordplay',
            properties: {
              clue_type: { type: 'string', const: '&lit' },

              definition_scope: {
                type: 'string',
                const: 'entire_clue',
              },

              clue_segmentation: {
                type: 'array',
                description: 'Verbatim word-by-word token segmentation of the entire clue. Every word must be represented; strip all punctuation from tokens and do not emit punctuation-only tokens.',
                minItems: 1,
                items: {
                  type: 'object',
                  properties: {
                    text: {
                      type: 'string',
                      description: 'A single word token from the clue (punctuation stripped; no punctuation-only tokens).'
                    },
                    role: {
                      type: 'string',
                      enum: ['definition', 'wordplay', 'indicator', 'link'],
                      description: 'The role of this token in the clue structure.'
                    }
                  },
                  required: ['text', 'role'],
                  additionalProperties: false
                }
              },

              wordplay_steps: {
                type: 'array',
                minItems: 1,
                items: {
                  type: 'object',
                  properties: {
                    tokens: {
                      type: 'string',
                      description: 'Exact contiguous span of clue text consumed in this step — must be a verbatim substring of the current clue state',
                    },
                    operation: {
                      type: 'string',
                      enum: [
                        'synonym', 'abbreviate', 'literal', 'translation',
                        'anagram', 'reversal', 'trim', 'delete', 'concatenate',
                        'container', 'hidden', 'homophone', 'initials',
                      ],
                      description: 'The cryptic operation performed (must be one of the allowed values)',
                    },
                    result: {
                      type: 'string',
                      description: 'Resulting letter string after the operation',
                    },
                    clue_after: {
                      type: 'string',
                      description: 'The clue with consumed tokens replaced by the result',
                    },
                  },
                  required: ['tokens', 'operation', 'result', 'clue_after'],
                  additionalProperties: false,
                },
              },

              hint: {
                type: 'object',
                properties: {
                  wordplay_types: {
                    type: 'array',
                    minItems: 1,
                    items: { type: 'string' },
                  },
                },
                required: ['wordplay_types'],
                additionalProperties: false,
              },

              full_explanation: {
                type: 'string',
              },
            },
            required: [
              'clue_type',
              'definition_scope',
              'clue_segmentation',
              'wordplay_steps',
              'hint',
              'full_explanation',
            ],
            additionalProperties: false,
          },

          // =========================
          // CRYPTIC DEFINITION CLUE
          // =========================
          {
            type: 'object',
            description:
              'A cryptic definition clue: no separable wordplay; the entire clue is a single misleading definition',
            properties: {
              clue_type: { type: 'string', const: 'cryptic_definition' },

              definition_scope: {
                type: 'string',
                const: 'entire_clue',
              },

              clue_segmentation: {
                type: 'array',
                description: 'Verbatim word-by-word token segmentation of the entire clue. Every word must be represented; strip all punctuation from tokens and do not emit punctuation-only tokens.',
                minItems: 1,
                items: {
                  type: 'object',
                  properties: {
                    text: {
                      type: 'string',
                      description: 'A single word token from the clue (punctuation stripped; no punctuation-only tokens).'
                    },
                    role: {
                      type: 'string',
                      enum: ['definition', 'wordplay', 'indicator', 'link'],
                      description: 'The role of this token in the clue structure.'
                    }
                  },
                  required: ['text', 'role'],
                  additionalProperties: false
                }
              },

              definition_paraphrase: {
                type: 'string',
                description:
                  'A concise paraphrase of what the whole clue is defining (no wordplay decomposition)',
              },

              hint: {
                type: 'object',
                properties: {
                  definition_scope: { type: 'string', const: 'entire_clue' },
                },
                required: ['definition_scope'],
                additionalProperties: false,
              },

              full_explanation: {
                type: 'string',
              },
            },
            required: [
              'clue_type',
              'definition_scope',
              'clue_segmentation',
              'definition_paraphrase',
              'hint',
              'full_explanation',
            ],
            additionalProperties: false,
          },

          // =========================
          // NO CLEAN PARSE
          // =========================
          {
            type: 'object',
            description:
              'Used when no clean parse can be produced without inventing indicators or forcing letter accounting',
            properties: {
              clue_type: { type: 'string', const: 'no_clean_parse' },

              intended_clue_type: {
                type: 'string',
                enum: ['wordplay', 'double_definition', '&lit', 'cryptic_definition'],
                description: 'Best-guess clue type if the clue were clued cleanly',
              },

              clue_segmentation: {
                type: 'array',
                description: 'Verbatim word-by-word token segmentation of the entire clue. Every word must be represented; strip all punctuation from tokens and do not emit punctuation-only tokens.',
                minItems: 1,
                items: {
                  type: 'object',
                  properties: {
                    text: {
                      type: 'string',
                      description: 'A single word token from the clue (punctuation stripped; no punctuation-only tokens).'
                    },
                    role: {
                      type: 'string',
                      enum: ['definition', 'wordplay', 'indicator', 'link'],
                      description: 'The role of this token in the clue structure.'
                    }
                  },
                  required: ['text', 'role'],
                  additionalProperties: false
                }
              },

              definition: {
                type: 'string',
                description: 'The exact definition from the clue (best guess)',
              },

              issue: {
                type: 'string',
                description:
                  'Precise reason a clean parse is not possible (missing indicator, letter accounting mismatch, etc.)',
              },

              hint: {
                type: 'object',
                properties: {
                  intended_clue_type: {
                    type: 'string',
                    enum: ['wordplay', 'double_definition', '&lit', 'cryptic_definition'],
                  },
                },
                required: ['intended_clue_type'],
                additionalProperties: false,
              },

              full_explanation: {
                type: 'string',
              },
            },
            required: ['clue_type', 'intended_clue_type', 'clue_segmentation', 'definition', 'issue', 'hint', 'full_explanation'],
            additionalProperties: false,
          },
        ],
      },
    },

    required: ['clue_type', 'explanation'],
    additionalProperties: false,
  },
}
