#!/usr/bin/env bun
import db from '../db-knex'

interface OldFormat {
  definition?: string
  letter_breakdown?: Array<{ source: string; letters: string }>
  wordplay_steps?: Array<{ indicator: string; operation: string; result: string }>
  hint?: {
    definition_location?: 'start' | 'end'
    wordplay_types?: string[]
  }
  full_explanation?: string
}

interface NewFormat {
  clue_type: string
  explanation: {
    clue_type: string
    [key: string]: any
  }
}

async function migrateExplanations() {
  console.log('🔄 Starting explanation_json format migration...\n')

  const rows = await db('clue_explanations').select('*')

  if (rows.length === 0) {
    console.log('✓ No explanations found to migrate.')
    return
  }

  console.log(`Found ${rows.length} explanation(s) to check.\n`)

  let migrated = 0
  let skipped = 0
  let errors = 0

  for (const row of rows) {
    try {
      const data = JSON.parse(row.explanation_json)

      // Check if already in new format
      if (data.clue_type && data.explanation) {
        skipped++
        continue
      }

      // Old format detected - wrap it
      // Default to 'wordplay' since that was the only type before this migration
      const newFormat: NewFormat = {
        clue_type: 'wordplay',
        explanation: {
          clue_type: 'wordplay',
          ...data,
        },
      }

      await db('clue_explanations').where('id', row.id).update({
        explanation_json: JSON.stringify(newFormat),
      })

      migrated++

      if (migrated % 10 === 0) {
        process.stdout.write(`  Migrated ${migrated} rows...\r`)
      }
    } catch (error) {
      console.error(`\n❌ Error processing row ${row.id}:`, error)
      errors++
    }
  }

  console.log(
    `\n\n✅ Migration complete!\n   Migrated: ${migrated}\n   Skipped: ${skipped}\n   Errors: ${errors}`,
  )
}

migrateExplanations()
  .then(() => {
    console.log('\n✓ Done.')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Migration failed:', error)
    process.exit(1)
  })
