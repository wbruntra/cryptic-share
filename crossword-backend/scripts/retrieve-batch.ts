#!/usr/bin/env bun
/**
 * Retrieve and validate batch results with Zod schema validation
 */

import OpenAI from 'openai'
import db from '../db-knex'
import { ExplanationSchema } from '../utils/crypticSchema'
import { ExplanationService } from '../services/explanationService'
import he from 'he'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

const rot13 = (str: string): string => {
  return str.replace(/[a-zA-Z]/g, (c) => {
    const base = c <= 'Z' ? 65 : 97
    return String.fromCharCode(base + ((c.charCodeAt(0) - base + 13) % 26))
  })
}

function decodeEntities(value: unknown): unknown {
  if (typeof value === 'string') {
    return he.decode(value)
  }
  if (Array.isArray(value)) {
    return value.map(decodeEntities)
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, decodeEntities(v)]))
  }
  return value
}

async function retrieveAndValidateBatch(batchId: string) {
  console.log(`\n📥 Retrieving batch: ${batchId}\n`)

  // Check status first
  const batch = await openai.batches.retrieve(batchId)
  console.log(`Status: ${batch.status}`)

  if (batch.status !== 'completed') {
    console.log(`⚠️  Batch not completed yet. Current status: ${batch.status}`)
    console.log(
      `   Request counts: ${batch.request_counts?.completed}/${batch.request_counts?.total} completed`,
    )

    // Update DB
    await db('explanation_batches').where('batch_id', batchId).update({
      status: batch.status,
      output_file_id: batch.output_file_id || null,
      updated_at: db.fn.now(),
    })

    return
  }

  if (!batch.output_file_id) {
    console.log('❌ No output file ID found.')
    return
  }

  console.log(`✓ Batch completed. Downloading results...\n`)

  // Download results
  const fileResponse = await openai.files.content(batch.output_file_id)
  const fileContents = await fileResponse.text()

  const results = fileContents
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))

  console.log(`📊 Processing ${results.length} results...\n`)

  let validCount = 0
  let invalidCount = 0
  let savedCount = 0
  let failedCount = 0

  const validationErrors: Array<{ customId: string; errors: string[] }> = []

  for (const result of results) {
    const customId = result.custom_id
    console.log(`\n🔍 Processing: ${customId}`)

    try {
      // Parse custom_id: regen_p{puzzleId}_c{clueNumber}_{direction}
      const match = customId.match(/regen_p(\d+)_c(\d+)_(across|down)/)
      if (!match) {
        console.log(`  ❌ Invalid custom_id format`)
        failedCount++
        continue
      }

      const [, puzzleIdStr, clueNumberStr, direction] = match
      const puzzleId = parseInt(puzzleIdStr)
      const clueNumber = parseInt(clueNumberStr)

      // Check API response
      if (result.response.status_code !== 200) {
        console.log(`  ❌ API error: ${result.response.status_code}`)
        failedCount++
        continue
      }

      // Extract content from response
      let content: string | undefined
      const body = result.response.body

      // Try Responses API structure
      if (body.output && Array.isArray(body.output)) {
        const messageOutput = body.output.find((o: any) => o.type === 'message')
        if (messageOutput && messageOutput.content && Array.isArray(messageOutput.content)) {
          const textOutput = messageOutput.content.find((c: any) => c.type === 'output_text')
          if (textOutput && textOutput.text) {
            content = textOutput.text
          }
        }
      }

      // Try Chat Completions API structure (fallback)
      if (!content && body.choices?.[0]?.message?.content) {
        content = body.choices[0].message.content
      }

      if (!content) {
        console.log(`  ❌ Could not extract content from response`)
        failedCount++
        continue
      }

      // Parse the explanation JSON
      let parsed: any
      try {
        parsed = JSON.parse(content)
      } catch (parseError) {
        console.log(`  ❌ Failed to parse explanation JSON: ${parseError}`)
        failedCount++
        continue
      }

      // Decode HTML entities
      parsed = decodeEntities(parsed)

      // Extract inner explanation - API returns { clue_type, explanation: {...} }
      // but we need just the inner object for validation and storage
      let explanation: any
      if (parsed.explanation && typeof parsed.explanation === 'object') {
        // Nested format from API
        explanation = parsed.explanation
        console.log(`  📦 Extracted nested explanation (type: ${parsed.clue_type})`)
      } else if (parsed.clue_type) {
        // Already flat format
        explanation = parsed
        console.log(`  📦 Using flat explanation format`)
      } else {
        console.log(`  ❌ Unexpected explanation structure`)
        failedCount++
        continue
      }

      // VALIDATE WITH ZOD SCHEMA
      console.log(`  🔬 Validating against Zod schema...`)
      const validationResult = ExplanationSchema.safeParse(explanation)

      if (!validationResult.success) {
        console.log(`  ❌ VALIDATION FAILED!`)
        let errorMessages: string[]
        try {
          const zodErrors = JSON.parse(validationResult.error.message)
          errorMessages = zodErrors.map((err: any) => {
            const path = err.path?.join('.') || '(root)'
            return `${path}: ${err.message}`
          })
        } catch {
          errorMessages = [validationResult.error.message]
        }

        console.log(`     Errors:`)
        for (const msg of errorMessages) {
          console.log(`       - ${msg}`)
        }

        validationErrors.push({
          customId,
          errors: errorMessages,
        })
        invalidCount++
        continue
      }

      console.log(`  ✅ Validation passed!`)
      validCount++

      // Fetch puzzle data to get the clue text and answer
      const puzzle = await db('puzzles').where('id', puzzleId).first()
      if (!puzzle) {
        console.log(`  ⚠️  Puzzle ${puzzleId} not found, cannot save`)
        continue
      }

      const clues = JSON.parse(puzzle.clues)
      const answersEncrypted = JSON.parse(puzzle.answers_encrypted || '{}')

      const clueList = direction === 'across' ? clues.across : clues.down
      const answerList = direction === 'across' ? answersEncrypted.across : answersEncrypted.down

      const clueObj = clueList.find((c: any) => c.number === clueNumber)
      const answerObj = answerList.find((a: any) => a.number === clueNumber)

      if (!clueObj || !answerObj) {
        console.log(`  ⚠️  Clue/answer data not found`)
        continue
      }

      const decryptedAnswer = rot13(answerObj.answer)

      // Save to database
      console.log(`  💾 Saving to database...`)
      await ExplanationService.saveExplanation(
        puzzleId,
        clueNumber,
        direction,
        clueObj.clue,
        decryptedAnswer,
        explanation,
      )

      savedCount++
      console.log(`  ✓ Saved successfully`)
    } catch (error) {
      console.log(`  ❌ Error processing result: ${error}`)
      failedCount++
    }
  }

  // Summary
  console.log('\n' + '='.repeat(80))
  console.log('BATCH PROCESSING SUMMARY')
  console.log('='.repeat(80))
  console.log(`Total results:        ${results.length}`)
  console.log(`✅ Validated:         ${validCount}`)
  console.log(`❌ Invalid:           ${invalidCount}`)
  console.log(`💾 Saved:             ${savedCount}`)
  console.log(`⚠️  Failed:           ${failedCount}`)

  if (validationErrors.length > 0) {
    console.log('\n' + '='.repeat(80))
    console.log('VALIDATION ERRORS')
    console.log('='.repeat(80))
    for (const error of validationErrors) {
      console.log(`\n${error.customId}:`)
      for (const msg of error.errors) {
        console.log(`  - ${msg}`)
      }
    }
  }

  // Update database
  if (savedCount > 0) {
    await db('explanation_batches')
      .where('batch_id', batchId)
      .update({
        status: 'completed',
        output_file_id: batch.output_file_id,
        applied_at: db.fn.now(),
        updated_at: db.fn.now(),
      })
    console.log('\n✓ Batch marked as applied in database.')
  } else {
    await db('explanation_batches')
      .where('batch_id', batchId)
      .update({
        status: 'completed',
        output_file_id: batch.output_file_id,
        updated_at: db.fn.now(),
      })
    console.log('\n⚠️  No results saved - batch not marked as applied.')
  }
}

async function main() {
  const batchId = process.argv[2]

  if (!batchId) {
    console.error('❌ Usage: bun scripts/retrieve-batch.ts <batch_id>')
    process.exit(1)
  }

  try {
    await retrieveAndValidateBatch(batchId)
  } catch (error) {
    console.error('\n❌ Error:', error)
    process.exit(1)
  } finally {
    await db.destroy()
    process.exit(0)
  }
}

main()
