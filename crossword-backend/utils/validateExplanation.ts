/**
 * Validation utility for clue explanations
 * Ensures all explanations conform to the expected flattened schema
 */

import Ajv, { ValidateFunction } from 'ajv'

const flatExplanationSchema = {
  anyOf: [
    // WORDPLAY
    {
      type: 'object',
      properties: {
        clue_type: { type: 'string', const: 'wordplay' },
        definition: { type: 'string' },
        letter_breakdown: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              source: { type: 'string' },
              letters: { type: 'string', pattern: '^[A-Z]+$' },
            },
            required: ['source', 'letters'],
            additionalProperties: false,
          },
        },
        wordplay_steps: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              indicator: { type: 'string' },
              operation: { type: 'string' },
              result: { type: 'string' },
            },
            required: ['indicator', 'operation', 'result'],
            additionalProperties: false,
          },
        },
        hint: {
          type: 'object',
          properties: {
            definition_location: { type: 'string', enum: ['start', 'end'] },
            wordplay_types: { type: 'array', items: { type: 'string' } },
          },
          required: ['definition_location', 'wordplay_types'],
          additionalProperties: false,
        },
        full_explanation: { type: 'string' },
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

    // DOUBLE DEFINITION
    {
      type: 'object',
      properties: {
        clue_type: { type: 'string', const: 'double_definition' },
        definitions: {
          type: 'array',
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
        full_explanation: { type: 'string' },
      },
      required: ['clue_type', 'definitions', 'hint', 'full_explanation'],
      additionalProperties: false,
    },

    // &LIT
    {
      type: 'object',
      properties: {
        clue_type: { type: 'string', const: '&lit' },
        definition_scope: { type: 'string', const: 'entire_clue' },
        letter_breakdown: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              source: { type: 'string' },
              letters: { type: 'string', pattern: '^[A-Z]+$' },
            },
            required: ['source', 'letters'],
            additionalProperties: false,
          },
        },
        wordplay_steps: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              indicator: { type: 'string' },
              operation: { type: 'string' },
              result: { type: 'string' },
            },
            required: ['indicator', 'operation', 'result'],
            additionalProperties: false,
          },
        },
        hint: {
          type: 'object',
          properties: {
            wordplay_types: { type: 'array', items: { type: 'string' } },
          },
          required: ['wordplay_types'],
          additionalProperties: false,
        },
        full_explanation: { type: 'string' },
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

    // CRYPTIC DEFINITION
    {
      type: 'object',
      properties: {
        clue_type: { type: 'string', const: 'cryptic_definition' },
        definition_scope: { type: 'string', const: 'entire_clue' },
        definition_paraphrase: { type: 'string' },
        hint: {
          type: 'object',
          properties: {
            definition_scope: { type: 'string', const: 'entire_clue' },
          },
          required: ['definition_scope'],
          additionalProperties: false,
        },
        full_explanation: { type: 'string' },
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

    // NO CLEAN PARSE
    {
      type: 'object',
      properties: {
        clue_type: { type: 'string', const: 'no_clean_parse' },
        intended_clue_type: {
          type: 'string',
          enum: ['wordplay', 'double_definition', '&lit', 'cryptic_definition'],
        },
        definition: { type: 'string' },
        issue: { type: 'string' },
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
        full_explanation: { type: 'string' },
      },
      required: ['clue_type', 'intended_clue_type', 'definition', 'issue', 'hint', 'full_explanation'],
      additionalProperties: false,
    },
  ],
}

// Stored schema (nested wrapper)
const storedExplanationSchema = {
  type: 'object',
  properties: {
    clue_type: {
      type: 'string',
      enum: ['wordplay', 'double_definition', '&lit', 'cryptic_definition', 'no_clean_parse'],
    },
    explanation: flatExplanationSchema,
  },
  required: ['clue_type', 'explanation'],
  additionalProperties: false,
}

// Accept either stored wrapper or the inner explanation object
const explanationSchema = {
  anyOf: [storedExplanationSchema, flatExplanationSchema],
}

let validateFunction: ValidateFunction | null = null

/**
 * Get or create the AJV validator (singleton)
 */
function getValidator(): ValidateFunction {
  if (!validateFunction) {
    const ajv = new Ajv({ allErrors: true, strict: false })
    validateFunction = ajv.compile(explanationSchema)
  }
  return validateFunction
}

export interface ValidationResult {
  valid: boolean
  errors?: string[]
}

/**
 * Validate an explanation object against the schema
 * @param explanation The explanation object to validate
 * @returns ValidationResult with valid flag and optional error messages
 */
export function validateExplanation(explanation: unknown): ValidationResult {
  const validate = getValidator()
  const isValid = validate(explanation)

  if (isValid) {
    return { valid: true }
  }

  const errors =
    validate.errors?.map((err) => {
      const path = err.instancePath || '(root)'
      const message = err.message || 'unknown error'
      const params = err.params ? ` ${JSON.stringify(err.params)}` : ''
      return `${path}: ${message}${params}`
    }) || []

  return { valid: false, errors }
}

/**
 * Validate and throw if invalid
 * @param explanation The explanation object to validate
 * @throws Error if validation fails
 */
export function assertValidExplanation(explanation: unknown): void {
  const result = validateExplanation(explanation)
  if (!result.valid) {
    throw new Error(
      `Explanation validation failed:\n  ${result.errors?.join('\n  ')}`,
    )
  }
}
