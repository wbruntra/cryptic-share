import OpenAI from 'openai'
import db from '../db-knex'
import { generateExplanationMessages } from '../utils/openai'
import { ExplanationService } from '../services/explanationService'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import fs from 'fs'
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

async function createBatch(puzzleId: string) {
  console.log(`Fetching data for puzzle ID: ${puzzleId}`)
  const puzzle = await db<PuzzleRow>('puzzles').where('id', puzzleId).first()

  if (!puzzle) {
    console.error(`Puzzle with ID ${puzzleId} not found.`)
    process.exit(1)
  }

  const clues: PuzzleClues = JSON.parse(puzzle.clues)
  let answersData: PuzzleAnswers

  try {
    const encrypted = JSON.parse(puzzle.answers_encrypted || '{}')
    if (!encrypted.puzzle_id) {
      // Maybe it's directly the answers object?
      answersData = encrypted
    } else {
      answersData = encrypted
    }
  } catch (e) {
    console.error('Failed to parse encrypted answers JSON')
    process.exit(1)
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

    // Construct custom_id: p{id}_c{num}_across
    const customId = `p${puzzle.id}_c${clue.number}_across`

    requests.push({
      custom_id: customId,
      method: 'POST',
      url: '/v1/responses',
      body: {
        model: 'gpt-5-mini',
        input: messages,
        text: { format: { type: 'json_object' } },
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
        input: messages, // 'input' is used for responses endpoint instead of 'messages'
        text: { format: { type: 'json_object' } },
      },
    })
  }

  if (requests.length === 0) {
    console.log('No clues found to process.')
    return
  }

  console.log(`Generated ${requests.length} requests.`)

  // Write JSONL file
  const jsonlContent = requests.map((r) => JSON.stringify(r)).join('\n')
  const filename = `batch_input_puzzle_${puzzleId}.jsonl`
  const filePath = join(process.cwd(), filename)

  await writeFile(filePath, jsonlContent)
  console.log(`Written batch input to ${filename}`)

  // Upload file
  console.log('Uploading file to OpenAI...')
  const file = await openai.files.create({
    file: fs.createReadStream(filePath),
    purpose: 'batch',
  })
  console.log(`File uploaded. ID: ${file.id}`)

  // Create Batch
  console.log('Creating batch job...')
  const batch = await openai.batches.create({
    input_file_id: file.id,
    endpoint: '/v1/responses',
    completion_window: '24h', // Class T1 or 24h
  })

  console.log(`Batch job created!`)
  console.log(`Batch ID: ${batch.id}`)

  // Save to DB
  await db('explanation_batches').insert({
    batch_id: batch.id,
    puzzle_id: puzzle.id,
    status: 'pending',
    input_file_id: file.id,
  })
  console.log(`Batch record saved to database.`)
}

async function checkBatch(batchId: string) {
  console.log(`Checking status for batch: ${batchId}`)
  const batch = await openai.batches.retrieve(batchId)
  console.log(`Status: ${batch.status}`)
  console.log(
    `Request Counts: Completed=${batch.request_counts?.completed}, Failed=${batch.request_counts?.failed}, Total=${batch.request_counts?.total}`,
  )
  if (batch.output_file_id) {
    console.log(`Output File ID: ${batch.output_file_id}`)
  }

  // Update DB
  await db('explanation_batches')
    .where('batch_id', batchId)
    .update({
      status: batch.status,
      output_file_id: batch.output_file_id || null,
      updated_at: db.fn.now(),
    })
  console.log(`Database updated with status: ${batch.status}`)
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

// Helper to unescape HTML entities
function unescapeHtml(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#38;/g, '&') // Add more if needed or use a library, but basic set + &#38; is good start
}

async function retrieveBatch(batchId: string) {
  console.log(`Retrieving results for batch: ${batchId}`)
  const batch = await openai.batches.retrieve(batchId)

  if (batch.status !== 'completed') {
    console.log(`Batch not completed. Status: ${batch.status}`)
    return
  }

  if (!batch.output_file_id) {
    console.log('No output file ID found.')
    // Update status anyway
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

  console.log(`Downloading output file: ${batch.output_file_id}`)
  const fileResponse = await openai.files.content(batch.output_file_id)
  const fileContents = await fileResponse.text()

  const results = fileContents
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
  console.log(`Processing ${results.length} results...`)

  let successCount = 0
  let failCount = 0

  for (const result of results) {
    try {
      const customId = result.custom_id // p{id}_c{num}_{dir}
      const [pPart, cPart, dir] = customId.split('_')
      const puzzleId = parseInt(pPart.substring(1))
      const clueNumber = parseInt(cPart.substring(1))
      const direction = dir

      if (result.response.status_code !== 200) {
        console.error(`Request failed for ${customId}: ${result.response.status_code}`)
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
          `Unexpected response structure for ${customId}:`,
          JSON.stringify(body).substring(0, 200),
        )
        failCount++
        continue
      }

      const explanation = JSON.parse(content)

      // Unescape text fields
      if (typeof explanation.full_explanation === 'string') {
        explanation.full_explanation = decodeEntities(explanation.full_explanation)
      }
      if (explanation.definition) {
        explanation.definition = decodeEntities(explanation.definition)
      }

      // We need the clue text and answer to save it
      // Fetching from DB again is safest
      const puzzle = await db<PuzzleRow>('puzzles').where('id', puzzleId).first()
      if (!puzzle) continue

      const clues: PuzzleClues = JSON.parse(puzzle.clues)
      const encrypted = JSON.parse(puzzle.answers_encrypted || '{}')

      // Helper to find clue/answer
      const clueList = direction === 'across' ? clues.across : clues.down
      const answerList = direction === 'across' ? encrypted.across : encrypted.down

      const clueObj = clueList.find((c) => c.number === clueNumber)
      // Cast answerList explicitly since encrypted is any
      const answerObj = (answerList as Answer[])?.find((a) => a.number === clueNumber)

      if (!clueObj || !answerObj) {
        console.warn(`Could not find clue/answer data for ${customId}`)
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
      console.error(`Error processing result`, err)
      failCount++
    }
  }

  console.log(`Finished. Saved: ${successCount}, Failed: ${failCount}`)
}

async function listBatches() {
  const batches = await db('explanation_batches').orderBy('created_at', 'desc').limit(10)
  console.table(batches)
}

async function main() {
  const command = process.argv[2]
  const arg = process.argv[3]

  if (!command || (command !== 'list' && !arg)) {
    console.log('Usage:')
    console.log('  bun scripts/batch-explanation.ts create <puzzle_id>')
    console.log('  bun scripts/batch-explanation.ts check <batch_id>')
    console.log('  bun scripts/batch-explanation.ts retrieve <batch_id>')
    console.log('  bun scripts/batch-explanation.ts list')
    process.exit(1)
  }

  try {
    if (command === 'create') {
      await createBatch(arg!)
    } else if (command === 'check') {
      await checkBatch(arg!)
    } else if (command === 'retrieve') {
      await retrieveBatch(arg!)
    } else if (command === 'list') {
      await listBatches()
    } else {
      console.log('Unknown command')
    }
  } catch (error) {
    console.error('An error occurred:', error)
  } finally {
    process.exit(0)
  }
}

main()
