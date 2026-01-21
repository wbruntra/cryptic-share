#!/usr/bin/env bun
/**
 * Normalize all stored clue explanations to a consistent inner-explanation format
 * - Removes nested wrapper objects (stores only the inner explanation)
 * - Fixes field names (group → source, etc.)
 * - Uppercases letters in letter_breakdown
 * - Removes extraneous fields
 */

import db from '../db-knex'

interface AnyExplanation {
  [key: string]: any
}

function normalizeExplanation(data: AnyExplanation): AnyExplanation | null {
  try {
    // Unwrap nested explanation if present
    let explanation = data
    if (data.explanation && typeof data.explanation === 'object') {
      explanation = data.explanation
    }

    // Get the clue type
    const clueType =
      explanation.clue_type || explanation.type || data.clue_type || data.type

    if (!clueType) {
      console.warn('  ⚠️  No clue_type found, skipping')
      return null
    }

    // Normalize based on clue type
    if (clueType === 'wordplay') {
      return normalizeWordplay(explanation)
    } else if (clueType === 'double_definition') {
      return normalizeDoubleDefinition(explanation)
    } else if (clueType === '&lit') {
      return normalizeAndLit(explanation)
    } else if (clueType === 'cryptic_definition') {
      return normalizeCrypticDefinition(explanation)
    } else {
      console.warn(`  ⚠️  Unknown clue_type: ${clueType}`)
      return null
    }
  } catch (error) {
    console.error('  ❌ Error normalizing:', error)
    return null
  }
}

function normalizeLetterBreakdown(
  breakdown: any[] | undefined,
): Array<{ source: string; letters: string }> {
  if (!Array.isArray(breakdown)) return []

  return breakdown
    .map((item) => {
      // Handle old format with 'group' and 'indicator_producing_it'
      const letters =
        item.letters || item.group || item.result || item.letter_group || ''
      const source =
        item.source ||
        item.indicator_producing_it ||
        item.indicator ||
        item.clue_fragment ||
        ''

      return {
        source: String(source),
        letters: String(letters).toUpperCase().replace(/[^A-Z]/g, ''),
      }
    })
    .filter((item) => item.letters.length > 0)
}

function normalizeWordplaySteps(
  steps: any[] | undefined,
): Array<{ indicator: string; operation: string; result: string }> {
  if (!Array.isArray(steps)) return []

  return steps.map((step) => ({
    indicator: String(step.indicator || 'None'),
    operation: String(step.operation || step.mechanism || ''),
    result: String(step.result || step.output || '').toUpperCase(),
  }))
}

function normalizeWordplay(exp: AnyExplanation): AnyExplanation {
  return {
    clue_type: 'wordplay',
    definition: String(exp.definition || exp.definition_quoted || ''),
    letter_breakdown: normalizeLetterBreakdown(
      exp.letter_breakdown || exp.letter_breakd || [],
    ),
    wordplay_steps: normalizeWordplaySteps(
      exp.wordplay_steps || exp.wordplay || [],
    ),
    hint:
      typeof exp.hint === 'object'
        ? {
            definition_location:
              exp.hint.definition_location || exp.hint.def_location || 'start',
            wordplay_types: Array.isArray(exp.hint.wordplay_types)
              ? exp.hint.wordplay_types
              : [],
          }
        : {
            definition_location: 'start',
            wordplay_types: [],
          },
    full_explanation: String(exp.full_explanation || exp.explanation || ''),
  }
}

function normalizeDoubleDefinition(exp: AnyExplanation): AnyExplanation {
  let definitions = exp.definitions || []

  // Normalize definitions to array of objects
  if (Array.isArray(definitions)) {
    definitions = definitions.map((def: any) => {
      if (typeof def === 'string') {
        return { definition: def, sense: '' }
      }
      return {
        definition: String(def.definition || def.def || ''),
        sense: String(def.sense || def.meaning || ''),
      }
    })
  } else {
    definitions = []
  }

  return {
    clue_type: 'double_definition',
    definitions,
    hint:
      typeof exp.hint === 'object'
        ? { definition_count: 2 }
        : { definition_count: 2 },
    full_explanation: String(exp.full_explanation || exp.explanation || ''),
  }
}

function normalizeAndLit(exp: AnyExplanation): AnyExplanation {
  return {
    clue_type: '&lit',
    definition_scope: 'entire_clue',
    letter_breakdown: normalizeLetterBreakdown(
      exp.letter_breakdown || exp.letter_breakd || [],
    ),
    wordplay_steps: normalizeWordplaySteps(
      exp.wordplay_steps || exp.wordplay || [],
    ),
    hint:
      typeof exp.hint === 'object'
        ? {
            wordplay_types: Array.isArray(exp.hint.wordplay_types)
              ? exp.hint.wordplay_types
              : [],
          }
        : { wordplay_types: [] },
    full_explanation: String(exp.full_explanation || exp.explanation || ''),
  }
}

function normalizeCrypticDefinition(exp: AnyExplanation): AnyExplanation {
  return {
    clue_type: 'cryptic_definition',
    definition_paraphrase: String(
      exp.definition_paraphrase || exp.paraphrase || exp.definition || '',
    ),
    hint: String(exp.hint || ''),
    full_explanation: String(exp.full_explanation || exp.explanation || ''),
  }
}

async function normalizeAllExplanations() {
  console.log('Fetching all clue explanations from database...\n')

  const explanations = await db('clue_explanations').select(
    'id',
    'puzzle_id',
    'clue_number',
    'clue_text',
    'explanation_json',
  )

  console.log(`Found ${explanations.length} explanations to normalize\n`)

  let successCount = 0
  let skipCount = 0
  let errorCount = 0

  for (const row of explanations) {
    try {
      const oldData = JSON.parse(row.explanation_json)
      const normalized = normalizeExplanation(oldData)

      if (!normalized) {
        console.log(
          `⏭️  Puzzle ${row.puzzle_id}, Clue ${row.clue_number}: Skipped`,
        )
        skipCount++
        continue
      }

      // Update the database
      await db('clue_explanations').where({ id: row.id }).update({
        explanation_json: JSON.stringify(normalized),
      })

      console.log(
        `✓ Puzzle ${row.puzzle_id}, Clue ${row.clue_number}: Normalized (${normalized.clue_type})`,
      )
      successCount++
    } catch (error) {
      console.error(
        `❌ Puzzle ${row.puzzle_id}, Clue ${row.clue_number}: Error - ${error}`,
      )
      errorCount++
    }
  }

  console.log('\n' + '='.repeat(80))
  console.log('NORMALIZATION COMPLETE')
  console.log('='.repeat(80))
  console.log(`Total: ${explanations.length}`)
  console.log(`✓ Normalized: ${successCount}`)
  console.log(`⏭️  Skipped: ${skipCount}`)
  console.log(`❌ Errors: ${errorCount}`)

  await db.destroy()
}

normalizeAllExplanations().catch((error) => {
  console.error('Script failed:', error)
  process.exit(1)
})
