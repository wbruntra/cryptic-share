#!/usr/bin/env bun
/**
 * Test the explanation validation utility
 */

import { validateExplanation, assertValidExplanation } from '../utils/validateExplanation'

console.log('Testing explanation validation...\n')

// Test 1: Valid wordplay explanation
console.log('✓ Test 1: Valid wordplay explanation')
const validWordplay = {
  clue_type: 'wordplay',
  definition: 'honest',
  letter_breakdown: [
    { source: 'Tense', letters: 'T' },
    { source: 'girl', letters: 'RUTH' },
    { source: 'nearly drunk', letters: 'FUL' },
  ],
  wordplay_steps: [
    { indicator: 'Tense', operation: 'abbreviation', result: 'T' },
    { indicator: 'girl', operation: 'female name', result: 'RUTH' },
    { indicator: 'nearly', operation: 'truncation', result: 'FUL' },
  ],
  hint: {
    definition_location: 'start',
    wordplay_types: ['charade', 'abbreviation', 'truncation'],
  },
  full_explanation: 'Definition: honest. Wordplay: T + RUTH + FUL = TRUTHFUL.',
}

const result1 = validateExplanation(validWordplay)
console.log(`  Valid: ${result1.valid}`)
if (!result1.valid) {
  console.log('  Errors:', result1.errors)
  process.exit(1)
}

// Test 2: Invalid - lowercase letters
console.log('\n✓ Test 2: Invalid wordplay - lowercase letters')
const invalidLetters = {
  clue_type: 'wordplay',
  definition: 'honest',
  letter_breakdown: [
    { source: 'test', letters: 'TeSt' }, // Mixed case - should fail
  ],
  wordplay_steps: [{ indicator: 'test', operation: 'test', result: 'TEST' }],
  hint: { definition_location: 'start', wordplay_types: [] },
  full_explanation: 'test',
}

const result2 = validateExplanation(invalidLetters)
console.log(`  Valid: ${result2.valid}`)
if (result2.valid) {
  console.log('  ERROR: Should have failed validation!')
  process.exit(1)
}
console.log(`  Expected errors found: ${result2.errors?.length || 0}`)

// Test 3: Valid double definition
console.log('\n✓ Test 3: Valid double definition')
const validDouble = {
  clue_type: 'double_definition',
  definitions: [
    { definition: 'Squander', sense: 'verb: to waste' },
    { definition: 'Fatty food', sense: 'noun: fried cake' },
  ],
  hint: { definition_count: 2 },
  full_explanation: 'Two definitions: fritter (verb) and fritter (noun).',
}

const result3 = validateExplanation(validDouble)
console.log(`  Valid: ${result3.valid}`)
if (!result3.valid) {
  console.log('  Errors:', result3.errors)
  process.exit(1)
}

// Test 4: Invalid - missing required field
console.log('\n✓ Test 4: Invalid - missing required field')
const invalidMissing = {
  clue_type: 'wordplay',
  definition: 'test',
  letter_breakdown: [{ source: 'test', letters: 'TEST' }],
  // Missing wordplay_steps
  hint: { definition_location: 'start', wordplay_types: [] },
  full_explanation: 'test',
}

const result4 = validateExplanation(invalidMissing)
console.log(`  Valid: ${result4.valid}`)
if (result4.valid) {
  console.log('  ERROR: Should have failed validation!')
  process.exit(1)
}
console.log(`  Expected errors found: ${result4.errors?.length || 0}`)

// Test 5: Invalid - extra field
console.log('\n✓ Test 5: Invalid - extra field not allowed')
const invalidExtra = {
  clue_type: 'wordplay',
  definition: 'test',
  letter_breakdown: [{ source: 'test', letters: 'TEST' }],
  wordplay_steps: [{ indicator: 'test', operation: 'test', result: 'TEST' }],
  hint: { definition_location: 'start', wordplay_types: [] },
  full_explanation: 'test',
  extra_field: 'not allowed', // Extra field
}

const result5 = validateExplanation(invalidExtra)
console.log(`  Valid: ${result5.valid}`)
if (result5.valid) {
  console.log('  ERROR: Should have failed validation!')
  process.exit(1)
}
console.log(`  Expected errors found: ${result5.errors?.length || 0}`)

// Test 6: assertValidExplanation throws
console.log('\n✓ Test 6: assertValidExplanation throws on invalid')
try {
  assertValidExplanation(invalidMissing)
  console.log('  ERROR: Should have thrown!')
  process.exit(1)
} catch (error) {
  console.log('  Correctly threw error')
}

console.log('\n✅ All validation tests passed!')
