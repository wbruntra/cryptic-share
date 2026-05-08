import { OpenRouter } from '@openrouter/sdk'
import { resolve, join } from 'path'
import * as path from 'path'
import * as fs from 'fs'
import { mkdir, writeFile } from 'fs/promises'
import { crypticSchema, crypticInstructions } from './crypticSchema'

const client = new OpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
})

export const getCrosswordClues = async (base64Image: string, model = models.flash) => {
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

Rules:
- If a section is missing, return an empty array for it.
- If a clue number is unclear, omit that clue.
`

  const result = await client.chat.send({
    chatRequest: {
      model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: instructions },
            {
              type: 'image_url',
              imageUrl: { url: `data:image/jpeg;base64,${base64Image}` },
            },
          ],
        },
      ],
      responseFormat: {
        type: 'json_schema',
        jsonSchema: {
          name: 'crossword_clues',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              across: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    number: { type: 'number' },
                    clue: { type: 'string' },
                  },
                  required: ['number', 'clue'],
                  additionalProperties: false,
                },
              },
              down: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    number: { type: 'number' },
                    clue: { type: 'string' },
                  },
                  required: ['number', 'clue'],
                  additionalProperties: false,
                },
              },
            },
            required: ['across', 'down'],
            additionalProperties: false,
          },
        },
      },
      plugins: [{ id: 'response-healing' }],
      stream: false,
    },
  })

  const content = result?.choices[0]?.message.content
  if (!content) throw new Error('No content received from OpenRouter')
  if (typeof content !== 'string') throw new Error('Expected string content from OpenRouter')
  return JSON.parse(content)
}

export const generateGrid = async (input: any) => {
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
  Analyze this crossword grid. 
  Return a JSON object containing a single property "rows".
  "rows" should be an array of strings, where each string represents one row of the grid.
  
  Use ONLY these characters for the squares:
  - "W": White square (empty, no number)
  - "B": Black square (block)
  - "N": Numbered square (white square with a number in it)
  
  Separate characters with a single space.
  Example format: "N W B N W"
`

  try {
    const result = await client.chat.send({
      chatRequest: {
        model: 'google/gemini-3-flash-preview',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: promptText,
              },
              {
                type: 'image_url',
                imageUrl: {
                  url: `data:${mimeType};base64,${base64Data}`,
                },
              },
            ],
          },
        ],
        responseFormat: {
          type: 'json_schema',
          jsonSchema: {
            name: 'crossword_grid',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                rows: {
                  type: 'array',
                  description: 'Array of strings representing each row of the crossword grid',
                  items: {
                    type: 'string',
                    description: 'Row with space-separated characters (W, B, or N)',
                  },
                },
              },
              required: ['rows'],
              additionalProperties: false,
            },
          },
        },
        plugins: [{ id: 'response-healing' }],
        stream: false,
      },
    })

    const content = result?.choices[0]?.message.content

    if (!content) {
      throw new Error('No content received from OpenRouter')
    }

    if (typeof content !== 'string') {
      throw new Error('Expected string content from OpenRouter')
    }

    return JSON.parse(content)
  } catch (error) {
    console.error('Error parsing grid:', error)
    throw error
  }
}

export const transcribeAnswers = async (input: any, model = models.flash) => {
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
  Transcribe these cryptic crossword answers. Each section represents a different numbered puzzle, and within each section there are "Across" and "Down" sections.
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
    const result = await client.chat.send({
      chatRequest: {
        model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: promptText },
              {
                type: 'image_url',
                imageUrl: { url: `data:${mimeType};base64,${base64Data}` },
              },
            ],
          },
        ],
        responseFormat: {
          type: 'json_schema',
          jsonSchema: {
            name: 'crossword_answers',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                puzzles: {
                  type: 'array',
                  description: 'Array of objects representing each puzzle',
                  items: {
                    type: 'object',
                    properties: {
                      puzzle_id: { type: 'number', description: 'The ID of the puzzle (numbered)' },
                      across: {
                        type: 'array',
                        description: 'Array of objects representing each across clue',
                        items: {
                          type: 'object',
                          properties: {
                            number: { type: 'number', description: 'The number of the clue' },
                            answer: { type: 'string', description: 'The answer text' },
                          },
                          required: ['number', 'answer'],
                          additionalProperties: false,
                        },
                      },
                      down: {
                        type: 'array',
                        description: 'Array of objects representing each down clue',
                        items: {
                          type: 'object',
                          properties: {
                            number: { type: 'number', description: 'The number of the clue' },
                            answer: { type: 'string', description: 'The answer text' },
                          },
                          required: ['number', 'answer'],
                          additionalProperties: false,
                        },
                      },
                    },
                    required: ['puzzle_id', 'across', 'down'],
                    additionalProperties: false,
                  },
                },
              },
              required: ['puzzles'],
              additionalProperties: false,
            },
          },
        },
        plugins: [{ id: 'response-healing' }],
        stream: false,
      },
    })

    const content = result?.choices[0]?.message.content

    if (!content) {
      throw new Error('No content received from OpenRouter')
    }

    if (typeof content !== 'string') {
      throw new Error('Expected string content from OpenRouter')
    }

    return JSON.parse(content)
  } catch (error) {
    console.error('Error parsing grid:', error)
    throw error
  }
}

const models = {
  flash: 'google/gemini-3-flash-preview',
  gemini: 'google/gemini-3-pro-preview',
  haiku: 'anthropic/claude-haiku-4.5',
  sonnet: 'anthropic/claude-sonnet-4.5',
  deepseek: 'deepseek/deepseek-v3.2',
}

export const explainCrypticClue = async (input: {
  clue: string
  answer: string
  mode?: 'hint' | 'full'
  model?: string
}) => {
  const { clue, answer, mode = 'full', model = models.flash } = input

  const instructions = crypticInstructions

  try {
    const result = await client.chat.send({
      chatRequest: {
        model: model,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Clue: ${clue}\nAnswer: ${answer}`,
              },
              { type: 'text', text: instructions },
            ],
          },
        ],
        responseFormat: {
          type: 'json_schema',
          jsonSchema: {
            name: crypticSchema.name,
            strict: crypticSchema.strict,
            schema: crypticSchema.schema,
          },
        },
        plugins: [{ id: 'response-healing' }],
        stream: false,
      },
    })

    const content = result?.choices[0]?.message.content

    if (!content) {
      throw new Error('No content received from OpenRouter')
    }

    if (typeof content !== 'string') {
      throw new Error('Expected string content from OpenRouter')
    }

    return JSON.parse(content)
  } catch (error) {
    console.error('Error explaining clue:', error)
    throw error
  }
}

const test = async () => {
  const input = {
    clue: "With Christmas nearly over recall dance's sleepy tune (7)",
    answer: 'LULLABY',
    mode: 'full' as const,
    model: models.haiku,
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
  const filename = `test-openrouter-${timestamp}.json`
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
