import OpenAI from 'openai'
import db from '../db-knex'
import { generateExplanationMessages, crypticSchema, ExplanationSchema } from '../utils/crypticSchema'
import { ExplanationService } from '../services/explanationService'
import he from 'he'
import { select, confirm, input } from '@inquirer/prompts'

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

async function createBatch(puzzleId: number) {
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

  // Fetch existing explanations to filter them out by default
  const existingExplanations = await db('clue_explanations')
    .where('puzzle_id', puzzleId)
    .select('clue_number', 'direction')
  
  const existingSet = new Set(
    existingExplanations.map((e) => `${e.clue_number}_${e.direction}`)
  )

  console.log(`ℹ️  Found ${existingExplanations.length} existing explanations for this puzzle.`)

  const requests = []

  // Process Across
  for (const clue of clues.across) {
    const answerObj = answersAcross.find((a) => a.number === clue.number)
    if (!answerObj) continue

    const key = `${clue.number}_across`
    if (existingSet.has(key)) {
      // Skip clues that already have explanations
      continue
    }

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

    const key = `${clue.number}_down`
    if (existingSet.has(key)) {
      // Skip clues that already have explanations
      continue
    }

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

  const proceed = await confirm({
    message: `⚠️ Create a batch job with ${requests.length} clue explanations?`,
    default: false,
  })

  if (!proceed) {
    console.log('❌ Batch creation cancelled.')
    return
  }

  // Create JSONL content in memory
  const jsonlContent = requests.map((r) => JSON.stringify(r)).join('\n')
  
  // Use Blob/File for Bun compatibility to avoid stream hangs
  const filename = `batch_p${puzzleId}_${Date.now()}.jsonl`
  const blobOrFile: any = typeof (globalThis as any).File !== 'undefined'
    ? new (globalThis as any).File([jsonlContent], filename, { type: 'application/jsonl' })
    : new Blob([jsonlContent], { type: 'application/jsonl' })

  // Upload directly to OpenAI
  console.log('📤 Uploading batch to OpenAI...')
  const file = await openai.files.create({
    file: blobOrFile,
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

  // Get puzzle titles and numbers
  const puzzleIds = [...new Set(batches.map((b) => b.puzzle_id))]
  const puzzles = await db<PuzzleRow>('puzzles').select('id', 'title', 'puzzle_number').whereIn('id', puzzleIds)
  const puzzleMap = new Map(puzzles.map((p) => [p.id, { title: p.title, puzzle_number: p.puzzle_number }]))

  console.log('#  | Status  | P#   | Puzzle ID | Puzzle Title              | Created')
  console.log('---+---------+------+-----------+---------------------------+-------------------')

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i]
    const statusEmoji =
      {
        pending: '⏳',
        completed: '✅',
        failed: '❌',
        in_progress: '🔄',
      }[batch.status] || '❓'

    const puzzleInfo = puzzleMap.get(batch.puzzle_id) || { title: 'Unknown', puzzle_number: null }
    const pn = puzzleInfo.puzzle_number ?? '—'
    const puzzleTitle = puzzleInfo.title.padEnd(25).substring(0, 25)
    const createdDate = new Date(batch.created_at).toISOString().substring(0, 16).replace('T', ' ')

    console.log(
      `${String(i + 1).padStart(2)} | ${statusEmoji} ${batch.status.padEnd(5)} | ${String(
        pn,
      ).padStart(4)} | ${String(batch.puzzle_id).padStart(9)} | ${puzzleTitle} | ${createdDate}`,
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
// Only includes puzzles that are not fully explained
async function getPuzzleChoices() {
  const puzzles = await db<PuzzleRow>('puzzles')
    .select('id', 'title', 'clues', 'puzzle_number')
    .orderBy('puzzle_number', 'asc')
    .orderBy('id', 'asc')

  const choices: Array<{ name: string; value: number }> = []

  for (const puzzle of puzzles) {
    const clues: PuzzleClues = JSON.parse(puzzle.clues)
    const totalClues = (clues.across?.length || 0) + (clues.down?.length || 0)

    const explainedCountRow = await db('clue_explanations')
      .where('puzzle_id', puzzle.id)
      .count('* as count')
      .first()

    const explained = Number((explainedCountRow as any)?.count ?? 0)
    
    // Skip puzzles that are fully explained
    if (explained >= totalClues && totalClues > 0) {
      continue
    }

    const pn = puzzle.puzzle_number ?? '—'
    const label = `#${pn} (explanations: ${explained}/${totalClues})`
    choices.push({ name: label, value: puzzle.id })
  }

  return choices
}

async function mainMenu(rl: readline.Interface) {
  while (true) {
    console.log('\n' + '='.repeat(60))
    console.log('🔤 BATCH EXPLANATION MANAGER')
    console.log('='.repeat(60))
    const choice = await select<string>({
      message: 'Select an option',
      choices: [
        { name: '1. View puzzle explanation status', value: '1' },
        { name: '2. View recent batch jobs', value: '2' },
        { name: '3. Create new batch job', value: '3' },
        { name: '4. Check batch status', value: '4' },
        { name: '5. Retrieve completed batch results', value: '5' },
        { name: '6. Delete an unapplied batch', value: '6' },
        { name: '7. Exit', value: '7' },
      ],
    })

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

          await createBatch(Number(selectedPuzzleId))
          break
        }

        case '4': {
          const batches = await showBatchStatus()
          if (!batches || batches.length === 0) {
            const manualId = await input({ message: 'Enter full batch ID (starts with batch_)' })
            if (manualId && manualId.trim().startsWith('batch_')) {
              await checkBatch(manualId.trim())
            } else {
              console.log('❌ Invalid batch ID')
            }
            break
          }

          // Fetch puzzle info to include puzzle_number in choices
          const puzzleIds = [...new Set(batches.map((b) => b.puzzle_id))]
          const puzzles = await db<PuzzleRow>('puzzles').select('id', 'puzzle_number').whereIn('id', puzzleIds)
          const puzzleMap = new Map(puzzles.map((p) => [p.id, p.puzzle_number]))

          const batchChoice = await select<string>({
            message: 'Select a batch to check status',
            choices: [
              ...batches.map((b, i) => {
                const pn = puzzleMap.get(b.puzzle_id) ?? '—'
                return { name: `${i + 1}. P#${pn} ${b.batch_id} (${b.status})`, value: b.batch_id }
              }),
              { name: 'Enter batch ID manually...', value: '__manual__' },
            ],
          })

          if (batchChoice === '__manual__') {
            const manualId = await input({ message: 'Enter full batch ID (starts with batch_)' })
            if (manualId && manualId.trim().startsWith('batch_')) {
              await checkBatch(manualId.trim())
            } else {
              console.log('❌ Invalid batch ID')
            }
          } else {
            await checkBatch(batchChoice)
          }
          break
        }

        case '5': {
          const batches = await showBatchStatus()
          if (!batches || batches.length === 0) {
            const manualId = await input({ message: 'Enter full batch ID (starts with batch_)' })
            if (manualId && manualId.trim().startsWith('batch_')) {
              await retrieveBatch(manualId.trim())
            } else {
              console.log('❌ Invalid batch ID')
            }
            break
          }

          // Fetch puzzle info to include puzzle_number in choices
          const puzzleIds2 = [...new Set(batches.map((b) => b.puzzle_id))]
          const puzzles2 = await db<PuzzleRow>('puzzles').select('id', 'puzzle_number').whereIn('id', puzzleIds2)
          const puzzleMap2 = new Map(puzzles2.map((p) => [p.id, p.puzzle_number]))

          const batchChoice = await select<string>({
            message: 'Select a batch to retrieve results',
            choices: [
              ...batches.map((b, i) => {
                const pn = puzzleMap2.get(b.puzzle_id) ?? '—'
                return { name: `${i + 1}. P#${pn} ${b.batch_id} (${b.status})`, value: b.batch_id }
              }),
              { name: 'Enter batch ID manually...', value: '__manual__' },
            ],
          })

          if (batchChoice === '__manual__') {
            const manualId = await input({ message: 'Enter full batch ID (starts with batch_)' })
            if (manualId && manualId.trim().startsWith('batch_')) {
              await retrieveBatch(manualId.trim())
            } else {
              console.log('❌ Invalid batch ID')
            }
          } else {
            await retrieveBatch(batchChoice)
          }
          break
        }

        case '6': {
          const batches = await showBatchStatus()
          if (!batches || batches.length === 0) {
            console.log('No pending batches to delete.')
            break
          }

          // Fetch puzzle info to include puzzle_number in choices
          const puzzleIds3 = [...new Set(batches.map((b) => b.puzzle_id))]
          const puzzles3 = await db<PuzzleRow>('puzzles').select('id', 'puzzle_number').whereIn('id', puzzleIds3)
          const puzzleMap3 = new Map(puzzles3.map((p) => [p.id, p.puzzle_number]))

          const batchChoice = await select<string>({
            message: 'Select an unapplied batch to delete',
            choices: batches.map((b, i) => {
              const pn = puzzleMap3.get(b.puzzle_id) ?? '—'
              return { name: `${i + 1}. P#${pn} ${b.batch_id} (${b.status})`, value: b.batch_id }
            }),
          })

          const proceedDelete = await confirm({
            message: `🗑️ Delete batch ${batchChoice}? This will remove it from the database${' '}
${' '.repeat(0)}and attempt to cancel it with OpenAI if still pending/in-progress.`,
            default: false,
          })

          if (!proceedDelete) {
            console.log('❌ Delete cancelled.')
            break
          }

          try {
            // Attempt to cancel on OpenAI (best effort)
            try {
              await openai.batches.cancel(batchChoice)
              console.log('✓ Requested cancellation with OpenAI.')
            } catch (err) {
              console.log('⚠️ Could not cancel with OpenAI or already finalized. Proceeding to delete record.')
            }

            // Delete from DB
            const deleted = await db('explanation_batches').where('batch_id', batchChoice).del()
            if (deleted) {
              console.log(`✅ Deleted batch ${batchChoice} from database.`)
            } else {
              console.log('⚠️ Batch not found in database.')
            }
          } catch (err) {
            console.error('❌ Error deleting batch:', err)
          }
          break
        }

        case '7':
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
  try {
    await mainMenu(undefined as any)
  } finally {
    process.exit(0)
  }
}

main()
