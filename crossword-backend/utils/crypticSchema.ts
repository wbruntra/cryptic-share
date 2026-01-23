import { z } from 'zod'

// =========================
// ZOD SCHEMA DEFINITIONS
// =========================

// Shared schemas for letter breakdown and wordplay steps
const LetterBreakdownItemSchema = z
  .object({
    source: z.string().describe('Clue text or fodder used to produce the letters'),
    letters: z
      .string()
      .regex(/^[A-Z]+$/)
      .describe('Uppercase letters contributed by this part (no spaces)'),
  })
  .strict()

const WordplayStepSchema = z
  .object({
    indicator: z.string().describe('Exact indicator text from the clue (or "None")'),
    operation: z.string().describe('The explicit cryptic operation performed'),
    result: z.string().describe('Resulting letters after the operation'),
  })
  .strict()

// Standard wordplay clue
const WordplayExplanationSchema = z
  .object({
    clue_type: z.literal('wordplay'),
    definition: z.string().describe('The exact definition from the clue'),
    letter_breakdown: z.array(LetterBreakdownItemSchema).min(1),
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
    letter_breakdown: z.array(LetterBreakdownItemSchema).min(1),
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
export const ExplanationSchema = z.discriminatedUnion('clue_type', [
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
1. Identify the clue type: wordplay (standard cryptic with definition + wordplay), double_definition, &lit (entire clue serves as both definition and wordplay), or cryptic_definition (no separable wordplay; the whole clue is a single misleading definition).
  If (and only if) you cannot produce a clean parse without inventing indicators or forcing letter accounting, set clue_type to no_clean_parse.
2. For wordplay clues: Identify the exact definition in the clue (quote it verbatim).
3. For &lit clues: Note that the entire clue is the definition, and provide the wordplay parse.
4. For double_definition clues: Identify both definitions and their distinct senses.
5. For cryptic_definition clues: Provide a concise paraphrase of the whole-clue definition; do not invent wordplay.
6. Provide both a hint and a full explanation appropriate to the clue type.

Core cryptic rules (strict):
- For wordplay and &lit clues: Each part of the wordplay MUST correspond to one explicit indicator in the clue.
- Use the simplest valid parse; do not offer alternatives or supporting interpretations.
- Do NOT mix mechanisms (e.g. hidden letters, charades, containers) unless the clue explicitly indicates them.
- For wordplay and &lit clues: Every letter in the answer MUST be explicitly justified.
- Compound/composite anagrams are allowed when the clue explicitly states an algebraic relationship (e.g. “A with/plus [answer] (could) make B”) and provides an anagram indicator for the combined/target fodder.
- In a compound anagram, the relationship phrase (e.g. “could make”, “with”, “plus”, “added to”) is the indicator for the equation/constraint; do NOT require a separate deletion/subtraction indicator if the relationship is clear and the letter accounting is exact.
- For cryptic_definition clues: Do NOT fabricate indicators, letter breakdowns, or wordplay steps.
- Do not invent extra indicators, padding, or explanatory glue.
- If a clean parse cannot be produced, state that the clue is loose or flawed rather than inventing one.

No-clean-parse handling:
- If a clean parse cannot be produced, return clue_type: no_clean_parse.
- Provide intended_clue_type as your best guess among: wordplay, double_definition, &lit, cryptic_definition.
- Provide the exact definition from the clue, since usually this can be identified knowing the answer and taking part of the clue, even if the wordplay element is not understood.
- In issue, state the precise reason you cannot parse cleanly (e.g. missing indicator, letter accounting mismatch).
- Do NOT fabricate letter breakdowns, indicators, or wordplay steps in this mode.

Letter accounting (mandatory for wordplay and &lit clues):
- Break the answer into its component letter groups.
- For each group, state exactly which indicator produced it.
- The concatenation of all letter groups MUST exactly equal the answer.

For compound/composite anagrams (still mandatory):
- Show the multiset letter arithmetic explicitly (e.g. “anagram(B) minus A = answer”, or “A + answer = anagram(B)”), and ensure the remaining letters anagram precisely to the answer.

Style constraints:
- Write like a crossword setter explaining a clue to another setter.
- Be concise and literal.
- Avoid hedging or justification language such as “also”, “alternatively”, “supported by”, or “equivalently”.
- Do not explain basic cryptic conventions unless necessary.

Output format:
Return ONLY valid JSON.

Final check (required):
- For wordplay and &lit clues: Verify that the letter_breakdown concatenates exactly to the answer.
- For double_definition clues: Verify that both definitions legitimately match the answer in different senses.
- For cryptic_definition clues: Verify that there is no separable wordplay and only a single whole-clue definition.

Constraints:
- full_explanation must be at most 4 sentences.
- Do not restate the clue.
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

              definition: {
                type: 'string',
                description: 'The exact definition from the clue',
              },

              letter_breakdown: {
                type: 'array',
                minItems: 1,
                items: {
                  type: 'object',
                  properties: {
                    source: {
                      type: 'string',
                      description: 'Clue text or fodder used to produce the letters',
                    },
                    letters: {
                      type: 'string',
                      description: 'Uppercase letters contributed by this part (no spaces)',
                      pattern: '^[A-Z]+$',
                    },
                  },
                  required: ['source', 'letters'],
                  additionalProperties: false,
                },
              },

              wordplay_steps: {
                type: 'array',
                minItems: 1,
                items: {
                  type: 'object',
                  properties: {
                    indicator: {
                      type: 'string',
                      description: 'Exact indicator text from the clue (or "None")',
                    },
                    operation: {
                      type: 'string',
                      description: 'The explicit cryptic operation performed',
                    },
                    result: {
                      type: 'string',
                      description: 'Resulting letters after the operation',
                    },
                  },
                  required: ['indicator', 'operation', 'result'],
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
              'definition',
              'letter_breakdown',
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
            required: ['clue_type', 'definitions', 'hint', 'full_explanation'],
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

              letter_breakdown: {
                type: 'array',
                minItems: 1,
                items: {
                  type: 'object',
                  properties: {
                    source: {
                      type: 'string',
                      description: 'Clue text or fodder used to produce the letters',
                    },
                    letters: {
                      type: 'string',
                      description: 'Uppercase letters contributed by this part (no spaces)',
                      pattern: '^[A-Z]+$',
                    },
                  },
                  required: ['source', 'letters'],
                  additionalProperties: false,
                },
              },

              wordplay_steps: {
                type: 'array',
                minItems: 1,
                items: {
                  type: 'object',
                  properties: {
                    indicator: {
                      type: 'string',
                      description: 'Exact indicator text from the clue (or "None")',
                    },
                    operation: {
                      type: 'string',
                      description: 'The explicit cryptic operation performed',
                    },
                    result: {
                      type: 'string',
                      description: 'Resulting letters after the operation',
                    },
                  },
                  required: ['indicator', 'operation', 'result'],
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
              'letter_breakdown',
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
            required: ['clue_type', 'intended_clue_type', 'definition', 'issue', 'hint', 'full_explanation'],
            additionalProperties: false,
          },
        ],
      },
    },

    required: ['clue_type', 'explanation'],
    additionalProperties: false,
  },
}
