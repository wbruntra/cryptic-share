import OpenAI from 'openai'
import db from '../db-knex'
import { generateExplanationMessages, crypticSchema, ExplanationSchema } from '../utils/crypticSchema'
import { ExplanationService } from '../services/explanationService'
import he from 'he'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

// Helper for ROT13 decryption
const rot13 = (str: string): string => {
  return str.replace(/[a-zA-Z]/g, (c) => {
    const base = c <= 'Z' ? 65 : 97
    return String.fromCharCode(base + ((c.charCodeAt(0) - base + 13) % 26))
  })
}

interface PuzzleRow {
  id: number
  title: string
  grid: string
  clues: string // JSON
  answers_encrypted: string // JSON
  puzzle_number: number | null
}

interface Answer {
  number: number
  answer: string
}

interface PuzzleAnswers {
  puzzle_id: number
  across: Answer[]
  down: Answer[]
}

interface ClueData {
  number: number
  clue: string
}

interface PuzzleClues {
  across: ClueData[]
  down: ClueData[]
}

interface BatchRow {
  id: number
  batch_id: string
  puzzle_id: number
  status: string
  input_file_id: string
  output_file_id: string | null
  created_at: string
  updated_at: string
  applied_at: string | null
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

interface PuzzleWithBatchInfo {
  id: number
  title: string
  puzzle_number: number | null
  total_clues: number
  explained_clues: number
  remaining: number
  hasAnswers: boolean
  requestCount: number | null
  error: string | null
}

async function findPuzzlesNeedingExplanations() {
  console.log('\n🔍 Finding puzzles that need explanations...\n')

  const puzzles = await db<PuzzleRow>('puzzles').select('id', 'title', 'clues', 'puzzle_number')

  const puzzlesNeedingExplanations = []

  for (const puzzle of puzzles) {
    const clues: PuzzleClues = JSON.parse(puzzle.clues)
    const totalClues = (clues.across?.length || 0) + (clues.down?.length || 0)

    const explainedCount = await db('clue_explanations')
      .where('puzzle_id', puzzle.id)
      .count('* as count')
      .first()

    const explained = (explainedCount as any)?.count || 0

    if (explained < totalClues) {
      puzzlesNeedingExplanations.push({
        id: puzzle.id,
        title: puzzle.title,
        puzzle_number: puzzle.puzzle_number,
        total_clues: totalClues,
        explained_clues: explained,
        remaining: totalClues - explained,
      })
    }
  }

  if (puzzlesNeedingExplanations.length === 0) {
    console.log('✅ All puzzles have complete explanations!')
    return []
  }

  console.log(`Found ${puzzlesNeedingExplanations.length} puzzle(s) needing explanations:\n`)
  for (const p of puzzlesNeedingExplanations) {
    const pn = p.puzzle_number ?? '—'
    console.log(
      `  P#${pn} (ID: ${p.id}) "${p.title}": ${p.explained_clues}/${p.total_clues} (${p.remaining} remaining)`,
    )
  }

  return puzzlesNeedingExplanations
}

async function analyzePuzzlesForDryRun(
  puzzles: Awaited<ReturnType<typeof findPuzzlesNeedingExplanations>>,
): Promise<PuzzleWithBatchInfo[]> {
  const analyzed: PuzzleWithBatchInfo[] = []

  for (const puzzle of puzzles) {
    const puzWithInfo: PuzzleWithBatchInfo = {
      ...puzzle,
      hasAnswers: false,
      requestCount: null,
      error: null,
    }

    try {
      const puzzleRow = await db<PuzzleRow>('puzzles').where('id', puzzle.id).first()
      if (!puzzleRow) {
        puzWithInfo.error = 'Puzzle not found'
        analyzed.push(puzWithInfo)
        continue
      }

      const encrypted = JSON.parse(puzzleRow.answers_encrypted || '{}')
      if (!encrypted.across && !encrypted.down) {
        puzWithInfo.error = 'No answers found'
        analyzed.push(puzWithInfo)
        continue
      }

      puzWithInfo.hasAnswers = true

      // Count how many requests would be created
      const clues: PuzzleClues = JSON.parse(puzzleRow.clues)
      let requestCount = 0

      // Count across clues that don't have explanations
      for (const clue of clues.across || []) {
        const existing = await db('clue_explanations')
          .where({ puzzle_id: puzzle.id, clue_number: clue.number, direction: 'across' })
          .first()
        if (!existing && (encrypted.across || []).some((a: Answer) => a.number === clue.number)) {
          requestCount++
        }
      }

      // Count down clues that don't have explanations
      for (const clue of clues.down || []) {
        const existing = await db('clue_explanations')
          .where({ puzzle_id: puzzle.id, clue_number: clue.number, direction: 'down' })
          .first()
        if (!existing && (encrypted.down || []).some((a: Answer) => a.number === clue.number)) {
          requestCount++
        }
      }

      puzWithInfo.requestCount = requestCount
      analyzed.push(puzWithInfo)
    } catch (error: any) {
      puzWithInfo.error = error.message || 'Unknown error'
      analyzed.push(puzWithInfo)
    }
  }

  return analyzed
}

async function dryRun() {
  console.log('\n' + '='.repeat(60))
  console.log('🔬 DRY RUN: PREVIEW BATCH CREATION')
  console.log('='.repeat(60))

  const puzzles = await findPuzzlesNeedingExplanations()

  if (puzzles.length === 0) {
    return
  }

  console.log('\n📊 ANALYZING PUZZLES...\n')

  const analyzed = await analyzePuzzlesForDryRun(puzzles)

  console.log('PUZZLE ANALYSIS')
  console.log('—'.repeat(60))
  console.log(
    `P#  | ID  | Title                      | Status    | Requests | Total`,
  )
  console.log('—'.repeat(60))

  let totalRequests = 0
  let successCount = 0
  let skipCount = 0

  for (const p of analyzed) {
    const pn = String(p.puzzle_number ?? '—').padStart(3)
    const id = String(p.id).padStart(3)
    const title = (p.title || 'Unknown').padEnd(26).substring(0, 26)

    let status = '✅'
    let requests = '-'
    let total = `-`

    if (p.error) {
      status = '❌'
      requests = '0'
      total = `(${p.error})`
      skipCount++
    } else if (p.hasAnswers && p.requestCount !== null) {
      if (p.requestCount > 0) {
        status = '✅'
        requests = String(p.requestCount).padStart(8)
        total = `${p.explained_clues}/${p.total_clues}`
        totalRequests += p.requestCount
        successCount++
      } else {
        status = '⏭️'
        requests = '0'
        total = 'All explained'
        skipCount++
      }
    }

    console.log(
      `${pn} | ${id} | ${title} | ${status}       | ${requests} | ${total}`,
    )
  }

  console.log('—'.repeat(60))

  console.log('\n📈 SUMMARY')
  console.log(`  Puzzles to process:  ${successCount}`)
  console.log(`  Puzzles to skip:     ${skipCount}`)
  console.log(`  Total requests:      ${totalRequests}`)

  if (totalRequests === 0) {
    console.log('\n✅ Nothing to do - all puzzles are complete or have no answers.')
  } else {
    console.log(
      `\n💡 Running without --dry-run will create 1 batch job${successCount > 1 ? 's' : ''} with ${totalRequests} total requests.`,
    )
  }

  console.log('\n' + '='.repeat(60))
  console.log('\n')
}

async function verifyAnswersExist(puzzleId: number): Promise<boolean> {
  const puzzle = await db<PuzzleRow>('puzzles').where('id', puzzleId).first()

  if (!puzzle) {
    console.log(`❌ Puzzle ID ${puzzleId} not found`)
    return false
  }

  try {
    const encrypted = JSON.parse(puzzle.answers_encrypted || '{}')
    if (!encrypted.across && !encrypted.down) {
      console.log(`❌ No answers found for puzzle "${puzzle.title}"`)
      return false
    }

    const acrossCount = (encrypted.across || []).length
    const downCount = (encrypted.down || []).length
    console.log(`✓ Puzzle has answers: ${acrossCount} across, ${downCount} down`)
    return true
  } catch (e) {
    console.log(`❌ Failed to parse answers for puzzle "${puzzle.title}"`)
    return false
  }
}

async function createBatchForPuzzle(puzzleId: number): Promise<string | null> {
  console.log(`\n📋 Creating batch for puzzle ID: ${puzzleId}`)

  const puzzle = await db<PuzzleRow>('puzzles').where('id', puzzleId).first()

  if (!puzzle) {
    console.error(`❌ Puzzle with ID ${puzzleId} not found.`)
    return null
  }

  console.log(`  Puzzle: "${puzzle.title}"`)

  const clues: PuzzleClues = JSON.parse(puzzle.clues)
  let answersData: PuzzleAnswers

  try {
    const encrypted = JSON.parse(puzzle.answers_encrypted || '{}')
    answersData = encrypted
  } catch (e) {
    console.error('  ❌ Failed to parse encrypted answers JSON')
    return null
  }

  // Decrypt answers
  const decryptList = (list: Answer[]) => list.map((a) => ({ ...a, answer: rot13(a.answer) }))
  const answersAcross = decryptList(answersData.across || [])
  const answersDown = decryptList(answersData.down || [])

  const requests = []

  // Process Across
  for (const clue of clues.across) {
    // Skip if already explained
    const existing = await db('clue_explanations')
      .where({
        puzzle_id: puzzle.id,
        clue_number: clue.number,
        direction: 'across',
      })
      .first()

    if (existing) continue

    const answerObj = answersAcross.find((a) => a.number === clue.number)
    if (!answerObj) continue

    const messages = generateExplanationMessages(clue.clue, answerObj.answer, 'full')
    const customId = `p${puzzle.id}_c${clue.number}_across`

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

  // Process Down
  for (const clue of clues.down) {
    // Skip if already explained
    const existing = await db('clue_explanations')
      .where({
        puzzle_id: puzzle.id,
        clue_number: clue.number,
        direction: 'down',
      })
      .first()

    if (existing) continue

    const answerObj = answersDown.find((a) => a.number === clue.number)
    if (!answerObj) continue

    const messages = generateExplanationMessages(clue.clue, answerObj.answer, 'full')
    const customId = `p${puzzle.id}_c${clue.number}_down`

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
    console.log('  ⚠️  No new clues to explain.')
    return null
  }

  console.log(`  ✓ Generated ${requests.length} explanation requests`)

  // Create JSONL content in memory
  const jsonlContent = requests.map((r) => JSON.stringify(r)).join('\n')

  // Use Blob/File for Bun compatibility to avoid stream hangs
  const filename = `batch_p${puzzleId}_${Date.now()}.jsonl`
  const blobOrFile: any = typeof (globalThis as any).File !== 'undefined'
    ? new (globalThis as any).File([jsonlContent], filename, { type: 'application/jsonl' })
    : new Blob([jsonlContent], { type: 'application/jsonl' })

  // Upload directly to OpenAI
  console.log('  📤 Uploading to OpenAI...')
  const file = await openai.files.create({
    file: blobOrFile,
    purpose: 'batch',
  })
  console.log(`  ✓ File uploaded (${file.id})`)

  // Create Batch
  console.log('  🚀 Creating batch job...')
  const batch = await openai.batches.create({
    input_file_id: file.id,
    endpoint: '/v1/responses',
    completion_window: '24h',
  })

  console.log(`  ✅ Batch created: ${batch.id}`)

  // Save to DB
  await db('explanation_batches').insert({
    batch_id: batch.id,
    puzzle_id: puzzle.id,
    status: 'pending',
    input_file_id: file.id,
  })
  console.log(`  ✓ Saved to database`)

  return batch.id
}

async function createBatchesForAllPuzzles() {
  const puzzlesNeedingExplanations = await findPuzzlesNeedingExplanations()

  if (puzzlesNeedingExplanations.length === 0) {
    return
  }

  console.log('\n📦 CREATING BATCH JOBS\n')
  console.log(`Processing ${puzzlesNeedingExplanations.length} puzzle(s)...\n`)

  const createdBatches = []

  for (const puzzle of puzzlesNeedingExplanations) {
    try {
      console.log(`\n--- Puzzle #${puzzle.puzzle_number ?? '?'} (ID: ${puzzle.id}) ---`)

      const hasAnswers = await verifyAnswersExist(puzzle.id)
      if (!hasAnswers) {
        console.log(`  ⏭️  Skipping puzzle without answers`)
        continue
      }

      const batchId = await createBatchForPuzzle(puzzle.id)
      if (batchId) {
        createdBatches.push({
          puzzle_id: puzzle.id,
          puzzle_number: puzzle.puzzle_number,
          batch_id: batchId,
        })
      }
    } catch (error) {
      console.error(`  ❌ Error processing puzzle ${puzzle.id}:`, error)
    }
  }

  console.log('\n' + '='.repeat(60))
  console.log('✅ BATCH CREATION COMPLETE')
  console.log('='.repeat(60))
  console.log(`\nCreated ${createdBatches.length} batch job(s):\n`)

  for (const batch of createdBatches) {
    const pn = batch.puzzle_number ?? '—'
    console.log(`  P#${pn}: ${batch.batch_id}`)
  }

  console.log('\n💡 Next steps:')
  console.log('   1. Wait for batches to complete (typically 1-24 hours)')
  console.log('   2. Run: bun scripts/batch-explanation-retrieve.ts')
  console.log('   3. Select completed batches to download and apply results')
}

async function retrieveAndApplyCompletedBatches() {
  console.log('\n' + '='.repeat(60))
  console.log('📥 RETRIEVING COMPLETED BATCHES')
  console.log('='.repeat(60))

  // Get all pending/in_progress batches that haven't been applied
  const batches = await db<BatchRow>('explanation_batches')
    .select('*')
    .whereNull('applied_at')
    .orderBy('created_at', 'desc')

  if (batches.length === 0) {
    console.log('\n✅ No pending batches to retrieve.')
    return
  }

  console.log(`\nFound ${batches.length} unapplied batch(es). Checking status...\n`)

  let completedBatches = []

  for (const batch of batches) {
    try {
      const batchStatus = await openai.batches.retrieve(batch.batch_id)

      const statusEmoji =
        {
          pending: '⏳',
          completed: '✅',
          failed: '❌',
          in_progress: '🔄',
          validating: '🔍',
          finalizing: '⏱️',
          cancelling: '🛑',
          cancelled: '❌',
          expired: '⏰',
        }[batchStatus.status as string] || '❓'

      console.log(`${statusEmoji} ${batch.batch_id} - ${batchStatus.status}`)

      if (batchStatus.status === 'completed') {
        completedBatches.push(batch)
      }

      // Update DB with latest status
      await db('explanation_batches')
        .where('batch_id', batch.batch_id)
        .update({
          status: batchStatus.status,
          output_file_id: batchStatus.output_file_id || null,
          updated_at: db.fn.now(),
        })
    } catch (error) {
      console.error(`  ❌ Error checking batch ${batch.batch_id}:`, error)
    }
  }

  if (completedBatches.length === 0) {
    console.log('\n⏳ No completed batches yet.')
    return
  }

  console.log(`\n📥 Found ${completedBatches.length} completed batch(es). Processing results...\n`)

  for (const batch of completedBatches) {
    console.log(`\nProcessing batch ${batch.batch_id}...`)
    await processBatchResults(batch.batch_id)
  }
}

async function processBatchResults(batchId: string) {
  const batchRecord = await db<BatchRow>('explanation_batches')
    .where('batch_id', batchId)
    .first()

  if (!batchRecord) {
    console.error(`  ❌ Batch ${batchId} not found in database`)
    return
  }

  const batch = await openai.batches.retrieve(batchId)

  if (batch.status !== 'completed') {
    console.log(`  ⚠️  Batch not completed. Status: ${batch.status}`)
    return
  }

  if (!batch.output_file_id) {
    console.log('  ❌ No output file ID found.')
    await db('explanation_batches').where('batch_id', batchId).update({
      status: batch.status,
      updated_at: db.fn.now(),
    })
    return
  }

  // Update DB status/output file
  await db('explanation_batches').where('batch_id', batchId).update({
    status: batch.status,
    output_file_id: batch.output_file_id,
    updated_at: db.fn.now(),
  })

  console.log(`  📥 Downloading results...`)
  const fileResponse = await openai.files.content(batch.output_file_id)
  const fileContents = await fileResponse.text()

  const results = fileContents
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))

  console.log(`  ⚙️  Processing ${results.length} results...`)

  let successCount = 0
  let failCount = 0
  let validationFailCount = 0

  for (const result of results) {
    try {
      const customId = result.custom_id
      const [pPart, cPart, dir] = customId.split('_')
      const puzzleId = parseInt(pPart.substring(1))
      const clueNumber = parseInt(cPart.substring(1))
      const direction = dir

      if (result.response.status_code !== 200) {
        console.error(`    ❌ Request failed for ${customId}: ${result.response.status_code}`)
        failCount++
        continue
      }

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
        console.error(
          `    ❌ Unexpected response structure for ${customId}:`,
          JSON.stringify(body).substring(0, 200),
        )
        failCount++
        continue
      }

      // Parse and decode the response
      let parsed = JSON.parse(content)
      parsed = decodeEntities(parsed)

      // Extract inner explanation
      let explanation: any
      if (parsed.explanation && typeof parsed.explanation === 'object') {
        explanation = parsed.explanation
      } else if (parsed.clue_type) {
        explanation = parsed
      } else {
        console.error(`    ❌ Unexpected explanation structure for ${customId}`)
        failCount++
        continue
      }

      // VALIDATE WITH ZOD SCHEMA
      const validationResult = ExplanationSchema.safeParse(explanation)
      if (!validationResult.success) {
        console.error(`    ❌ Validation failed for ${customId}`)
        validationFailCount++
        continue
      }

      // Fetch puzzle data
      const puzzle = await db<PuzzleRow>('puzzles').where('id', puzzleId).first()
      if (!puzzle) continue

      const clues: PuzzleClues = JSON.parse(puzzle.clues)
      const encrypted = JSON.parse(puzzle.answers_encrypted || '{}')

      const clueList = direction === 'across' ? clues.across : clues.down
      const answerList = direction === 'across' ? encrypted.across : encrypted.down

      const clueObj = clueList.find((c) => c.number === clueNumber)
      const answerObj = (answerList as Answer[])?.find((a) => a.number === clueNumber)

      if (!clueObj || !answerObj) {
        console.warn(`    ⚠️  Could not find clue/answer data for ${customId}`)
        continue
      }

      const decryptedAnswer = rot13(answerObj.answer)

      // Save using ExplanationService
      await ExplanationService.saveExplanation(
        puzzleId,
        clueNumber,
        direction,
        clueObj.clue,
        decryptedAnswer,
        explanation,
      )

      successCount++
    } catch (err) {
      console.error(`    ❌ Error processing result`, err)
      failCount++
    }
  }

  console.log(
    `  ✅ Saved: ${successCount}, Failed: ${failCount}, Validation failed: ${validationFailCount}`,
  )

  // Mark batch as applied if we successfully saved results
  if (successCount > 0) {
    await db('explanation_batches')
      .where('batch_id', batchId)
      .update({
        applied_at: db.fn.now(),
        updated_at: db.fn.now(),
      })
    console.log(`  ✓ Batch marked as applied`)
  }
}

async function main() {
  const command = process.argv[2]
  const dryRunFlag = process.argv.includes('--dry-run')

  try {
    if (command === 'retrieve') {
      await retrieveAndApplyCompletedBatches()
    } else {
      if (dryRunFlag) {
        await dryRun()
      } else {
        await createBatchesForAllPuzzles()
      }
    }
  } catch (error) {
    console.error('\n❌ Fatal error:', error)
    process.exit(1)
  } finally {
    process.exit(0)
  }
}

main()
