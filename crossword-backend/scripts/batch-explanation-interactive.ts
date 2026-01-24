import OpenAI from 'openai'
import db from '../db-knex'
import { generateExplanationMessages, crypticSchema, ExplanationSchema } from '../utils/crypticSchema'
import { ExplanationService } from '../services/explanationService'
import { Readable } from 'stream'
import he from 'he'
import * as readline from 'readline/promises'
import { stdin as input, stdout as output } from 'process'
import { select } from '@inquirer/prompts'

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

interface Clue {
  number: number
  clue: string
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

interface PuzzleWithStats {
  id: number
  title: string
  total_clues: number
  explained_clues: number
  completion_percentage: number
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

async function createBatch(puzzleId: number, rl: readline.Interface) {
  console.log(`\n📋 Fetching data for puzzle ID: ${puzzleId}`)
  const puzzle = await db<PuzzleRow>('puzzles').where('id', puzzleId).first()

  if (!puzzle) {
    console.error(`❌ Puzzle with ID ${puzzleId} not found.`)
    return
  }

  console.log(`✓ Found puzzle: "${puzzle.title}"`)

  const clues: PuzzleClues = JSON.parse(puzzle.clues)
  let answersData: PuzzleAnswers

  try {
    const encrypted = JSON.parse(puzzle.answers_encrypted || '{}')
    if (!encrypted.puzzle_id) {
      answersData = encrypted
    } else {
      answersData = encrypted
    }
  } catch (e) {
    console.error('❌ Failed to parse encrypted answers JSON')
    return
  }

  // Decrypt answers
  const decryptList = (list: Answer[]) => list.map((a) => ({ ...a, answer: rot13(a.answer) }))
  const answersAcross = decryptList(answersData.across || [])
  const answersDown = decryptList(answersData.down || [])

  const requests = []

  // Process Across
  for (const clue of clues.across) {
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
    console.log('⚠️  No clues found to process.')
    return
  }

  console.log(`✓ Generated ${requests.length} requests.`)

  const confirm = await rl.question(
    `\n⚠️  This will create a batch job with ${requests.length} clue explanations. Continue? (y/n): `,
  )

  if (confirm.toLowerCase() !== 'y') {
    console.log('❌ Batch creation cancelled.')
    return
  }

  // Create JSONL content in memory
  const jsonlContent = requests.map((r) => JSON.stringify(r)).join('\n')
  
  // Convert string to readable stream for upload
  const stream = Readable.from([jsonlContent])

  // Upload directly to OpenAI
  console.log('📤 Uploading batch to OpenAI...')
  const file = await openai.files.create({
    file: stream as any,
    purpose: 'batch',
  })
  console.log(`✓ File uploaded. ID: ${file.id}`)

  // Create Batch
  console.log('🚀 Creating batch job...')
  const batch = await openai.batches.create({
    input_file_id: file.id,
    endpoint: '/v1/responses',
    completion_window: '24h',
  })

  console.log(`✅ Batch job created!`)
  console.log(`   Batch ID: ${batch.id}`)

  // Save to DB
  await db('explanation_batches').insert({
    batch_id: batch.id,
    puzzle_id: puzzle.id,
    status: 'pending',
    input_file_id: file.id,
  })
  console.log(`✓ Batch record saved to database.`)
}

async function checkBatch(batchId: string) {
  console.log(`\n🔍 Checking status for batch: ${batchId}`)
  const batch = await openai.batches.retrieve(batchId)

  const statusEmoji =
    {
      pending: '⏳',
      completed: '✅',
      failed: '❌',
      in_progress: '🔄',
    }[batch.status] || '❓'

  console.log(`${statusEmoji} Status: ${batch.status}`)
  console.log(
    `   Request Counts: Completed=${batch.request_counts?.completed}, Failed=${batch.request_counts?.failed}, Total=${batch.request_counts?.total}`,
  )
  if (batch.output_file_id) {
    console.log(`   Output File ID: ${batch.output_file_id}`)
  }

  // Update DB
  await db('explanation_batches')
    .where('batch_id', batchId)
    .update({
      status: batch.status,
      output_file_id: batch.output_file_id || null,
      updated_at: db.fn.now(),
    })
  console.log(`✓ Database updated with status: ${batch.status}`)
}

async function retrieveBatch(batchId: string) {
  console.log(`\n📥 Retrieving results for batch: ${batchId}`)
  const batch = await openai.batches.retrieve(batchId)

  if (batch.status !== 'completed') {
    console.log(`⚠️  Batch not completed. Status: ${batch.status}`)
    return
  }

  if (!batch.output_file_id) {
    console.log('❌ No output file ID found.')
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

  console.log(`📥 Downloading output file: ${batch.output_file_id}`)
  const fileResponse = await openai.files.content(batch.output_file_id)
  const fileContents = await fileResponse.text()

  const results = fileContents
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
  console.log(`⚙️  Processing ${results.length} results...`)

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
        console.error(`❌ Request failed for ${customId}: ${result.response.status_code}`)
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
          `❌ Unexpected response structure for ${customId}:`,
          JSON.stringify(body).substring(0, 200),
        )
        failCount++
        continue
      }

      // Parse and decode the response
      let parsed = JSON.parse(content)
      parsed = decodeEntities(parsed)

      // Extract inner explanation - API returns { clue_type, explanation: {...} }
      // but we need just the inner object for validation and storage
      let explanation: any
      if (parsed.explanation && typeof parsed.explanation === 'object') {
        // Nested format from API
        explanation = parsed.explanation
      } else if (parsed.clue_type) {
        // Already flat format
        explanation = parsed
      } else {
        console.error(`❌ Unexpected explanation structure for ${customId}`)
        failCount++
        continue
      }

      // VALIDATE WITH ZOD SCHEMA
      const validationResult = ExplanationSchema.safeParse(explanation)
      if (!validationResult.success) {
        console.error(`❌ Validation failed for ${customId}`)
        try {
          const zodErrors = JSON.parse(validationResult.error.message)
          const errorMessages = zodErrors.map((err: any) => {
            const path = err.path?.join('.') || '(root)'
            return `${path}: ${err.message}`
          })
          console.error(`   Errors: ${errorMessages.join(', ')}`)
        } catch {
          console.error(`   Error: ${validationResult.error.message}`)
        }
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
        console.warn(`⚠️  Could not find clue/answer data for ${customId}`)
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
      console.error(`❌ Error processing result`, err)
      failCount++
    }
  }

  console.log(`\n✅ Finished. Saved: ${successCount}, Failed: ${failCount}, Validation failed: ${validationFailCount}`)

  // Mark batch as applied if we successfully saved results
  if (successCount > 0) {
    await db('explanation_batches')
      .where('batch_id', batchId)
      .update({
        applied_at: db.fn.now(),
        updated_at: db.fn.now(),
      })
    console.log('✓ Batch marked as applied in database.')
  }
}

async function showPuzzleStats() {
  console.log('\n📊 PUZZLE EXPLANATION STATUS\n')

  const puzzles = await db<PuzzleRow>('puzzles').select('id', 'title', 'clues').orderBy('id')

  const stats: PuzzleWithStats[] = []

  for (const puzzle of puzzles) {
    const clues: PuzzleClues = JSON.parse(puzzle.clues)
    const totalClues = (clues.across?.length || 0) + (clues.down?.length || 0)

    const explainedCount = await db('clue_explanations')
      .where('puzzle_id', puzzle.id)
      .count('* as count')
      .first()

    const explained = explainedCount?.count || 0
    const percentage = totalClues > 0 ? Math.round((explained / totalClues) * 100) : 0

    stats.push({
      id: puzzle.id,
      title: puzzle.title,
      total_clues: totalClues,
      explained_clues: explained,
      completion_percentage: percentage,
    })
  }

  // Display in a nice table format
  console.log('ID  | Title                          | Progress')
  console.log('----+--------------------------------+------------------')
  for (const stat of stats) {
    const progressBar = '█'.repeat(Math.floor(stat.completion_percentage / 5))
    const emptyBar = '░'.repeat(20 - Math.floor(stat.completion_percentage / 5))
    const titleTruncated = stat.title.padEnd(30).substring(0, 30)
    console.log(
      `${String(stat.id).padStart(3)} | ${titleTruncated} | ${progressBar}${emptyBar} ${
        stat.completion_percentage
      }% (${stat.explained_clues}/${stat.total_clues})`,
    )
  }
}

async function showBatchStatus() {
  console.log('\n📦 RECENT BATCH JOBS (Not Yet Applied)\n')

  // Only show batches that haven't been applied yet
  const batches = await db<BatchRow>('explanation_batches')
    .select('*')
    .whereNull('applied_at')
    .orderBy('created_at', 'desc')
    .limit(10)

  if (batches.length === 0) {
    console.log('No pending batch jobs found. ✓')
    return batches
  }

  // Get puzzle titles
  const puzzleIds = [...new Set(batches.map((b) => b.puzzle_id))]
  const puzzles = await db<PuzzleRow>('puzzles').select('id', 'title').whereIn('id', puzzleIds)
  const puzzleMap = new Map(puzzles.map((p) => [p.id, p.title]))

  console.log('#  | Status  | Puzzle | Puzzle Title              | Created')
  console.log('---+---------+--------+---------------------------+-------------------')

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i]
    const statusEmoji =
      {
        pending: '⏳',
        completed: '✅',
        failed: '❌',
        in_progress: '🔄',
      }[batch.status] || '❓'

    const puzzleTitle = (puzzleMap.get(batch.puzzle_id) || 'Unknown').padEnd(25).substring(0, 25)
    const createdDate = new Date(batch.created_at).toISOString().substring(0, 16).replace('T', ' ')

    console.log(
      `${String(i + 1).padStart(2)} | ${statusEmoji} ${batch.status.padEnd(5)} | ${String(
        batch.puzzle_id,
      ).padStart(6)} | ${puzzleTitle} | ${createdDate}`,
    )
  }

  console.log('\nBatch IDs (for copy/paste):')
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i]
    const statusEmoji =
      {
        pending: '⏳',
        completed: '✅',
        failed: '❌',
        in_progress: '🔄',
      }[batch.status] || '❓'
    console.log(`  ${i + 1}. ${statusEmoji} ${batch.batch_id}`)
  }

  return batches
}

// Build puzzle choices for inquirer selection with puzzle_number and explanation count
async function getPuzzleChoices() {
  const puzzles = await db<PuzzleRow>('puzzles')
    .select('id', 'title', 'clues', 'puzzle_number')
    .orderBy('puzzle_number', 'asc')
    .orderBy('id', 'asc')

  const choices: Array<{ name: string; value: number }> = []

  for (const puzzle of puzzles) {
    const explainedCountRow = await db('clue_explanations')
      .where('puzzle_id', puzzle.id)
      .count('* as count')
      .first()

    const explained = Number((explainedCountRow as any)?.count ?? 0)
    const pn = puzzle.puzzle_number ?? '—'
    const label = `#${pn} (explanations: ${explained})`
    choices.push({ name: label, value: puzzle.id })
  }

  return choices
}

async function mainMenu(rl: readline.Interface) {
  while (true) {
    console.log('\n' + '='.repeat(60))
    console.log('🔤 BATCH EXPLANATION MANAGER')
    console.log('='.repeat(60))
    console.log('\n1. View puzzle explanation status')
    console.log('2. View recent batch jobs')
    console.log('3. Create new batch job')
    console.log('4. Check batch status')
    console.log('5. Retrieve completed batch results')
    console.log('6. Exit')
    console.log('')

    const choice = await rl.question('Select an option (1-6): ')

    try {
      switch (choice.trim()) {
        case '1':
          await showPuzzleStats()
          break

        case '2':
          await showBatchStatus()
          break

        case '3': {
          const choices = await getPuzzleChoices()
          if (!choices.length) {
            console.log('❌ No puzzles found.')
            break
          }

          const selectedPuzzleId = await select<number>({
            message: 'Select a puzzle to create a batch for',
            choices,
          })

          await createBatch(Number(selectedPuzzleId), rl)
          break
        }

        case '4': {
          const batches = await showBatchStatus()
          if (!batches || batches.length === 0) break

          const input = await rl.question(
            '\nEnter batch number (1-' + batches.length + ') or full batch ID: ',
          )
          if (!input.trim()) {
            console.log('❌ Input is required')
            break
          }

          // Check if input is a number (batch selection) or a batch ID
          const num = parseInt(input.trim())
          let batchId: string

          if (!isNaN(num) && num >= 1 && num <= batches.length) {
            batchId = batches[num - 1].batch_id
            console.log(`\nUsing batch: ${batchId}`)
          } else if (input.trim().startsWith('batch_')) {
            batchId = input.trim()
          } else {
            console.log(
              '❌ Invalid input. Enter a number from the list or a full batch ID starting with "batch_"',
            )
            break
          }

          await checkBatch(batchId)
          break
        }

        case '5': {
          const batches = await showBatchStatus()
          if (!batches || batches.length === 0) break

          const input = await rl.question(
            '\nEnter batch number (1-' + batches.length + ') or full batch ID: ',
          )
          if (!input.trim()) {
            console.log('❌ Input is required')
            break
          }

          // Check if input is a number (batch selection) or a batch ID
          const num = parseInt(input.trim())
          let batchId: string

          if (!isNaN(num) && num >= 1 && num <= batches.length) {
            batchId = batches[num - 1].batch_id
            console.log(`\nUsing batch: ${batchId}`)
          } else if (input.trim().startsWith('batch_')) {
            batchId = input.trim()
          } else {
            console.log(
              '❌ Invalid input. Enter a number from the list or a full batch ID starting with "batch_"',
            )
            break
          }

          await retrieveBatch(batchId)
          break
        }

        case '6':
          console.log('\n👋 Goodbye!')
          return

        default:
          console.log('❌ Invalid option. Please choose 1-6.')
      }
    } catch (error) {
      console.error('\n❌ An error occurred:', error)
    }
  }
}

async function main() {
  const rl = readline.createInterface({ input, output })

  try {
    await mainMenu(rl)
  } finally {
    rl.close()
    process.exit(0)
  }
}

main()
