#!/usr/bin/env bun
/**
 * Validate all stored clue explanations against the JSON schema
 * Reports any explanations that don't conform to the expected structure
 */

import { ExplanationSchema } from '../utils/crypticSchema'
import db from '../db-knex'

interface ValidationError {
  puzzle_id: number
  clue_number: string
  clue_text: string
  clue_type: string
  errors: string[]
}

async function validateExplanations() {
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
    
    let explanation: any
    try {
      explanation = JSON.parse(row.explanation_json)
    } catch (jsonError) {
      // JSON parsing itself failed
      validationErrors.push({
        puzzle_id: row.puzzle_id,
        clue_number: row.clue_number,
        clue_text: clueText,
        clue_type: 'json_parse_error',
        errors: [`Failed to parse JSON: ${jsonError instanceof Error ? jsonError.message : String(jsonError)}`],
      })
      continue
    }

    try {
      // Use Zod safeParse to validate the inner explanation format
      const result = ExplanationSchema.safeParse(explanation)

      if (!result.success) {
        let errorMessages: string[]
        // Zod v4 stores errors in error.message as JSON string
        try {
          const zodErrors = JSON.parse(result.error.message)
          errorMessages = zodErrors.map((err: any) => {
            const path = err.path?.join('.') || '(root)'
            return `  ${path}: ${err.message}`
          })
        } catch {
          // Fallback to showing the raw message
          errorMessages = [`Validation failed: ${result.error.message}`]
        }

        validationErrors.push({
          puzzle_id: row.puzzle_id,
          clue_number: row.clue_number,
          clue_text: clueText,
          clue_type: explanation.clue_type || 'unknown',
          errors: errorMessages,
        })
      } else {
        validCount++
      }
    } catch (zodError) {
      // Zod validation threw an error
      validationErrors.push({
        puzzle_id: row.puzzle_id,
        clue_number: row.clue_number,
        clue_text: clueText,
        clue_type: explanation?.clue_type || 'validation_error',
        errors: [`Validation error: ${zodError instanceof Error ? zodError.message : String(zodError)}`],
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
