import OpenAI from 'openai'
import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { generateExplanationMessages, crypticSchema } from './crypticSchema'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export const getCrosswordClues = async (base64Image: string) => {
  const instructions = `
You are transcribing crossword clues from an image.

The image contains two sections:
- "Across"
- "Down"

Each section contains numbered crossword clues.

Your task:
1. Read the image carefully.
2. Extract all crossword clues.
3. Preserve the original clue numbers.
4. Do NOT infer answers or modify wording.
5. Return ONLY valid JSON in the following format:

{
  "across": [
    { "number": <integer>, "clue": <string> }
  ],
  "down": [
    { "number": <integer>, "clue": <string> }
  ]
}

Rules:
- If a section is missing, return an empty array for it.
- If a clue number is unclear, omit that clue.
- Do not include any commentary, markdown, or extra text.
`

  // Using specific API and model as requested
  const response = await (openai as any).responses.create({
    model: 'gpt-5-mini',
    input: [
      {
        role: 'user',
        content: [
          { type: 'input_text', text: instructions },
          {
            type: 'input_image',
            image_url: `data:image/jpeg;base64,${base64Image}`,
          },
        ],
      },
    ],
    text: {
      format: {
        type: 'json_object',
      },
    },
  })

  const outputText = response.output_text
  return JSON.parse(outputText)
}

export const transcribeAnswers = async (input: any) => {
  // Prepare the image data
  let base64Data: string
  let mimeType: string

  if (input.base64 && input.mimeType) {
    // Handle direct base64 input
    base64Data = input.base64
    mimeType = input.mimeType
  } else if (input.arrayBuffer && input.type) {
    // Handle File-like object
    const arrayBuffer = await input.arrayBuffer()
    base64Data = Buffer.from(arrayBuffer).toString('base64')
    mimeType = input.type
  } else {
    throw new Error('Invalid input format. Expected File object or { base64, mimeType }')
  }

  const promptText = `
  Transcribe these cryptic crossword answers. Each section represents a different numbered puzzle, and within each section there are "Across" and "Down" sub-sections.
  Return a JSON object containing a single property "puzzles".
  "puzzles" should be an array of objects, where each object represents one puzzle.

  Each puzzle object should have the following properties:
  - "puzzle_id": The ID of the puzzle (numbered)
  - "across": An array of objects, where each object represents one across answer
  - "down": An array of objects, where each object represents one down answer

  Each across and down object should have the following properties:
  - "number": The number of the answer
  - "answer": The answer text
`

  try {
    const response = await (openai as any).responses.create({
      model: 'gpt-5-mini', // Using the same model as getCrosswordClues
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: promptText },
            {
              type: 'input_image',
              image_url: `data:${mimeType};base64,${base64Data}`,
            },
          ],
        },
      ],
      text: {
        format: {
          type: 'json_object',
        },
      },
    })

    const outputText = response.output_text
    if (!outputText) {
      throw new Error('No content received from OpenAI')
    }

    return JSON.parse(outputText)
  } catch (error) {
    console.error('Error parsing grid:', error)
    throw error
  }
}

export const explainCrypticClue = async (input: {
  clue: string
  answer: string
  mode?: 'hint' | 'full'
}) => {
  const { clue, answer, mode = 'full' } = input

  const messages = generateExplanationMessages(clue, answer, mode)

  const requestBody = {
    model: 'gpt-5-mini',
    reasoning: { effort: 'medium' },
    input: messages,
    text: {
      format: crypticSchema,
    },
  }

  const response = await (openai as any).responses.create(requestBody)

  const outputText = response.output_text
  if (!outputText) {
    throw new Error('No content received from OpenAI')
  }

  return JSON.parse(outputText)
}

const test = async () => {
  const input = {
    clue: 'America and Germany seized Peru illegally and took over (7)',
    answer: 'USURPED',
    mode: 'full' as const,
  }

  const startTime = performance.now()
  const explanation = await explainCrypticClue(input)
  const endTime = performance.now()
  const durationSeconds = (endTime - startTime) / 1000

  console.log(JSON.stringify(explanation, null, 2))
  console.log(`\nResponse time: ${durationSeconds.toFixed(2)} seconds`)

  // Save test results to test_data folder
  const testDataDir = join(__dirname, '../test_data')
  await mkdir(testDataDir, { recursive: true })

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const filename = `test-${timestamp}.json`
  const filepath = join(testDataDir, filename)

  const testResult = {
    timestamp: new Date().toISOString(),
    durationSeconds: parseFloat(durationSeconds.toFixed(3)),
    input,
    result: explanation,
  }

  await writeFile(filepath, JSON.stringify(testResult, null, 2))
  console.log(`Test result saved to: ${filepath}`)
}

if (import.meta.main) {
  test().catch(console.error)
}
