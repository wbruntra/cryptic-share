#!/usr/bin/env bun
/**
 * Create a batch job to regenerate explanations for invalid clues
 */

import OpenAI from 'openai'
import db from '../db-knex'
import { generateExplanationMessages, crypticSchema } from '../utils/crypticSchema'
import { ExplanationSchema } from '../utils/crypticSchema'
import { Readable } from 'stream'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

const rot13 = (str: string): string => {
  return str.replace(/[a-zA-Z]/g, (c) => {
    const base = c <= 'Z' ? 65 : 97
    return String.fromCharCode(base + ((c.charCodeAt(0) - base + 13) % 26))
  })
}

interface InvalidClue {
  puzzle_id: number
  clue_number: string
  direction: string
  clue_text: string
  clue_type: string
  errors: string[]
  explanation_json: string
}

async function findInvalidClues(): Promise<InvalidClue[]> {
  console.log('🔍 Finding invalid clue explanations...\n')

  const explanations = await db('clue_explanations')
    .select(
      'clue_explanations.puzzle_id',
      'clue_explanations.clue_number',
      'clue_explanations.direction',
      'clue_explanations.clue_text',
      'clue_explanations.explanation_json',
    )
    .orderBy('clue_explanations.puzzle_id')
    .orderBy('clue_explanations.clue_number')
    .orderBy('clue_explanations.direction')

  const invalidClues: InvalidClue[] = []

  for (const row of explanations) {
    try {
      const explanation = JSON.parse(row.explanation_json)
      const result = ExplanationSchema.safeParse(explanation)

      if (!result.success) {
        let errorMessages: string[]
        try {
          const zodErrors = JSON.parse(result.error.message)
          errorMessages = zodErrors.map((err: any) => {
            const path = err.path?.join('.') || '(root)'
            return `${path}: ${err.message}`
          })
        } catch {
          errorMessages = [result.error.message]
        }

        invalidClues.push({
          puzzle_id: row.puzzle_id,
          clue_number: row.clue_number,
          direction: row.direction,
          clue_text: row.clue_text,
          clue_type: explanation.clue_type || 'unknown',
          errors: errorMessages,
          explanation_json: row.explanation_json,
        })
      }
    } catch (error) {
      // JSON parse error
      invalidClues.push({
        puzzle_id: row.puzzle_id,
        clue_number: row.clue_number,
        direction: row.direction,
        clue_text: row.clue_text,
        clue_type: 'parse_error',
        errors: [`Failed to parse JSON: ${error}`],
        explanation_json: row.explanation_json,
      })
    }
  }

  return invalidClues
}

async function createRegenerationBatch(clues: InvalidClue[], limit: number = 6) {
  console.log(`\n📋 Creating batch for ${Math.min(clues.length, limit)} invalid clues\n`)

  const selectedClues = clues.slice(0, limit)

  // Get puzzle and answer data for each clue
  const requests = []

  for (const clue of selectedClues) {
    // Fetch puzzle data
    const puzzle = await db('puzzles').where('id', clue.puzzle_id).first()

    if (!puzzle) {
      console.log(`⚠️  Puzzle ${clue.puzzle_id} not found, skipping`)
      continue
    }

    // Get the answer - use direction from the invalid clue data
    const answersEncrypted = JSON.parse(puzzle.answers_encrypted || '{}')
    const puzzleClues = JSON.parse(puzzle.clues)
    const direction = clue.direction

    // Get the CORRECT clue text from puzzle.clues JSON, not from clue_explanations
    const clueList = direction === 'across' ? puzzleClues.across : puzzleClues.down
    const clueObj = clueList.find((c: any) => c.number === parseInt(clue.clue_number))
    
    if (!clueObj) {
      console.log(`⚠️  Clue ${clue.clue_number} not found in puzzle clues, skipping`)
      continue
    }
    
    const correctClueText = clueObj.clue

    const answerList = direction === 'across' ? answersEncrypted.across : answersEncrypted.down
    const answerObj = answerList.find((a: any) => a.number === parseInt(clue.clue_number))

    if (!answerObj) {
      console.log(`⚠️  Answer not found for clue ${clue.clue_number}, skipping`)
      continue
    }

    const answer = rot13(answerObj.answer)

    console.log(`✓ Puzzle ${clue.puzzle_id}, Clue ${clue.clue_number} (${direction}): "${correctClueText}" → ${answer}`)
    console.log(`  Errors: ${clue.errors.join(', ')}`)

    // Generate batch request with the CORRECT clue text
    const messages = generateExplanationMessages(correctClueText, answer, 'full')
    const customId = `regen_p${clue.puzzle_id}_c${clue.clue_number}_${direction}`

    requests.push({
      custom_id: customId,
      method: 'POST',
      url: '/v1/responses',
      body: {
        model: 'gpt-5-mini',
        reasoning: { effort: 'medium' },
        input: messages,
        text: {
          format: crypticSchema,
        },
      },
    })
  }

  if (requests.length === 0) {
    console.log('❌ No valid requests to create')
    return
  }

  console.log(`\n📤 Creating batch with ${requests.length} requests...`)

  // Create JSONL content
  const jsonlContent = requests.map((r) => JSON.stringify(r)).join('\n')
  const stream = Readable.from([jsonlContent])

  // Upload to OpenAI
  const file = await openai.files.create({
    file: stream as any,
    purpose: 'batch',
  })
  console.log(`✓ File uploaded. ID: ${file.id}`)

  // Create Batch
  const batch = await openai.batches.create({
    input_file_id: file.id,
    endpoint: '/v1/responses',
    completion_window: '24h',
  })

  console.log(`✅ Batch job created!`)
  console.log(`   Batch ID: ${batch.id}`)
  console.log(`   Status: ${batch.status}`)

  // Save to DB with a special marker
  await db('explanation_batches').insert({
    batch_id: batch.id,
    puzzle_id: 0, // Special marker for multi-puzzle regeneration
    status: batch.status,
    input_file_id: file.id,
  })
  console.log(`✓ Batch record saved to database.`)
  console.log(`\n💡 To check status, run:`)
  console.log(`   bun scripts/retrieve-batch.ts ${batch.id}`)
}

async function main() {
  try {
    const invalidClues = await findInvalidClues()

    if (invalidClues.length === 0) {
      console.log('✅ No invalid clues found!')
      return
    }

    console.log(`\nFound ${invalidClues.length} invalid clues:`)
    for (let i = 0; i < Math.min(invalidClues.length, 6); i++) {
      const clue = invalidClues[i]
      console.log(
        `  ${i + 1}. Puzzle ${clue.puzzle_id}, Clue ${clue.clue_number}: "${clue.clue_text}"`,
      )
      console.log(`     Errors: ${clue.errors[0]}`)
    }

    await createRegenerationBatch(invalidClues, 6)
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  } finally {
    await db.destroy()
    process.exit(0)
  }
}

main()
