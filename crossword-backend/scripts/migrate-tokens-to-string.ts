/**
 * Migrate clue_explanations: convert wordplay_steps[].tokens from string[] to string.
 *
 * Old format: tokens: ["YULE", "nearly"]
 * New format: tokens: "YULE nearly"
 *
 * Explanations that already have string tokens are left unchanged.
 */

import db from '../db-knex'

function migrateTokens(explanation: any): { migrated: boolean; data: any } {
  const steps: any[] | undefined =
    explanation?.wordplay_steps ?? explanation?.explanation?.wordplay_steps

  if (!steps || steps.length === 0) {
    return { migrated: false, data: explanation }
  }

  let anyChanged = false

  const migrateSteps = (stepsArr: any[]) =>
    stepsArr.map((step) => {
      if (Array.isArray(step.tokens)) {
        anyChanged = true
        return { ...step, tokens: step.tokens.join(' ') }
      }
      return step
    })

  const cloned = JSON.parse(JSON.stringify(explanation))

  if (cloned?.explanation?.wordplay_steps) {
    cloned.explanation.wordplay_steps = migrateSteps(cloned.explanation.wordplay_steps)
  } else if (cloned?.wordplay_steps) {
    cloned.wordplay_steps = migrateSteps(cloned.wordplay_steps)
  }

  return { migrated: anyChanged, data: cloned }
}

async function run() {
  console.log('Migrating clue_explanations: tokens string[] → string...')

  const rows = await db('clue_explanations').select('id', 'explanation_json')
  let migratedCount = 0
  let errorCount = 0

  for (const row of rows) {
    try {
      const parsed = JSON.parse(row.explanation_json)
      const { migrated, data } = migrateTokens(parsed)

      if (migrated) {
        await db('clue_explanations')
          .where('id', row.id)
          .update({ explanation_json: JSON.stringify(data) })
        migratedCount++
      }
    } catch (err: any) {
      console.error(`Row ${row.id}: ${err.message}`)
      errorCount++
    }
  }

  console.log(`Done. Migrated: ${migratedCount}, Errors: ${errorCount}, Total: ${rows.length}`)
  process.exit(0)
}

run()
