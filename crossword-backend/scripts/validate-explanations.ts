#!/usr/bin/env bun
/**
 * Validate all stored clue explanations against the JSON schema
 * Reports any explanations that don't conform to the expected structure
 */

import Ajv from 'ajv'
import db from '../db-knex'

// Schema definition for flattened format (no nested explanation wrapper)
const explanationSchema = {
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
            definition_paraphrase: { type: 'string' },
            hint: { type: 'string' },
            full_explanation: { type: 'string' },
          },
          required: [
            'clue_type',
            'definition_paraphrase',
            'hint',
            'full_explanation',
          ],
          additionalProperties: false,
        },
      ],
}

interface ValidationError {
  puzzle_id: number
  clue_number: string
  clue_text: string
  clue_type: string
  errors: string[]
}

async function validateExplanations() {
  const ajv = new Ajv({ allErrors: true, strict: false })
  const validate = ajv.compile(explanationSchema)

  console.log('Fetching all clue explanations from database...\n')

  const explanations = await db('clue_explanations')
    .select(
      'clue_explanations.puzzle_id',
      'clue_explanations.clue_number',
      'clue_explanations.clue_text',
      'clue_explanations.explanation_json',
      'puzzles.clues',
    )
    .leftJoin('puzzles', 'clue_explanations.puzzle_id', 'puzzles.id')

  console.log(`Found ${explanations.length} explanations to validate\n`)

  const validationErrors: ValidationError[] = []
  let validCount = 0

  for (const row of explanations) {
    const clueText = row.clue_text || `Clue ${row.clue_number}`
    
    try {
      const explanation = JSON.parse(row.explanation_json)

      const isValid = validate(explanation)

      if (!isValid && validate.errors) {
        const errorMessages = validate.errors.map((err) => {
          const path = err.instancePath || '(root)'
          const message = err.message || 'unknown error'
          const params = err.params ? JSON.stringify(err.params) : ''
          return `  ${path}: ${message} ${params}`.trim()
        })

        validationErrors.push({
          puzzle_id: row.puzzle_id,
          clue_number: row.clue_number,
          clue_text: clueText,
          clue_type: explanation.clue_type,
          errors: errorMessages,
        })
      } else {
        validCount++
      }
    } catch (error) {
      validationErrors.push({
        puzzle_id: row.puzzle_id,
        clue_number: row.clue_number,
        clue_text: clueText,
        clue_type: 'unknown',
        errors: [`Failed to parse JSON: ${error}`],
      })
    }
  }

  // Print results
  console.log('='.repeat(80))
  console.log('VALIDATION RESULTS')
  console.log('='.repeat(80))
  console.log(`Total explanations: ${explanations.length}`)
  console.log(`Valid: ${validCount}`)
  console.log(`Invalid: ${validationErrors.length}`)
  console.log()

  if (validationErrors.length > 0) {
    console.log('INVALID EXPLANATIONS:')
    console.log('='.repeat(80))

    for (const error of validationErrors) {
      console.log(`Puzzle ${error.puzzle_id}, Clue ${error.clue_number}`)
      console.log(`  Type: ${error.clue_type}`)
      console.log(`  Clue: "${error.clue_text}"`)
      console.log(`  Errors:`)
      for (const msg of error.errors) {
        console.log(`    ${msg}`)
      }
      console.log()
    }

    // Group by error type
    const errorsByType = new Map<string, number>()
    for (const error of validationErrors) {
      for (const msg of error.errors) {
        const count = errorsByType.get(msg) || 0
        errorsByType.set(msg, count + 1)
      }
    }

    console.log('='.repeat(80))
    console.log('ERROR SUMMARY:')
    console.log('='.repeat(80))
    const sortedErrors = Array.from(errorsByType.entries()).sort(
      (a, b) => b[1] - a[1],
    )
    for (const [errorMsg, count] of sortedErrors) {
      console.log(`${count}× ${errorMsg}`)
    }
  } else {
    console.log('✓ All explanations are valid!')
  }

  await db.destroy()
}

validateExplanations().catch((error) => {
  console.error('Script failed:', error)
  process.exit(1)
})
