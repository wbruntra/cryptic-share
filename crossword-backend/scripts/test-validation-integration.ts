#!/usr/bin/env bun
import { ExplanationService } from '../services/explanationService'
import db from '../db-knex'

// Test that invalid explanations are rejected
const invalidExplanation = {
  clue_type: 'wordplay' as const,
  definition: 'test',
  letter_breakdown: [
    { source: 'test', letters: 'abc' }, // Invalid: lowercase
  ],
  wordplay_steps: [
    { indicator: 'test', operation: 'test', result: 'ABC' },
  ],
  hint: {
    definition_location: 'start' as const,
    wordplay_types: [],
  },
  full_explanation: 'test',
}

console.log('Testing validation integration with ExplanationService...\n')
console.log('Attempting to save invalid explanation (lowercase letters)...')

try {
  await ExplanationService.saveExplanation(
    999,
    1,
    'across',
    'Test clue',
    'ABC',
    invalidExplanation,
  )
  console.log('❌ ERROR: Should have rejected invalid explanation!')
  await db.destroy()
  process.exit(1)
} catch (error: any) {
  console.log('✅ Validation correctly rejected invalid explanation')
  console.log('   Error preview:', error.message?.split('\n')[0] + '...')
}

await db.destroy()
console.log('\n✅ Integration test passed!')
