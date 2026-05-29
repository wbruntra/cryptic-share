import { OpenRouter } from '@openrouter/sdk'
import { crypticSchema, crypticInstructions } from './crypticSchema'
import { OPENROUTER_MODELS } from '../config'

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
                      puzzle_id: {
                        type: 'number',
                        description: 'The ID of the puzzle (numbered)',
                      },
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

const models = OPENROUTER_MODELS

export const explainCrypticClue = async (input: {
  clue: string
  answer: string
  mode?: 'hint' | 'full'
  model?: string
  timeoutMs?: number
}) => {
  const { clue, answer, mode = 'full', model = models['deepseek-pro'], timeoutMs = 60_000 } = input

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const fetchPromise = client.chat.send({
      chatRequest: {
        model: model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: crypticInstructions },
              {
                type: 'text',
                text: `Clue: ${clue}\nAnswer: ${answer}`,
              },
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
        maxTokens: 16000,
        stream: false,
      },
    })

    const timeoutPromise = new Promise<never>((_, reject) => {
      controller.signal.addEventListener('abort', () =>
        reject(new Error(`Request timed out after ${timeoutMs / 1000}s (model: ${model})`)),
      )
    })

    const result = await Promise.race([fetchPromise, timeoutPromise])

    const content = result?.choices[0]?.message.content

    if (!content) {
      throw new Error('No content received from OpenRouter')
    }

    if (typeof content !== 'string') {
      throw new Error('Expected string content from OpenRouter')
    }

    return JSON.parse(content)
  } catch (error) {
    throw error
  } finally {
    clearTimeout(timer)
  }
}

export const regenerateCrypticClueExplanation = async (input: {
  clue: string
  answer: string
  feedback: string
  previousExplanation?: any
  model?: string
  timeoutMs?: number
}) => {
  const { clue, answer, feedback, previousExplanation, model = models['deepseek-pro'], timeoutMs = 120_000 } = input

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const messages: Array<{ role: 'user'; content: Array<{ type: 'text'; text: string }> }> = [
      {
        role: 'user',
        content: [
          { type: 'text', text: crypticInstructions },
          { type: 'text', text: `Clue: ${clue}\nAnswer: ${answer}` },
        ],
      },
    ]

    if (previousExplanation) {
      messages.push({
        role: 'user',
        content: [
          { type: 'text', text: `Previous explanation:\n${JSON.stringify(previousExplanation, null, 2)}\n\nThe previous explanation had this issue:\n"${feedback}"\n\nPlease provide a corrected explanation that addresses this.` },
        ],
      })
    } else {
      messages.push({
        role: 'user',
        content: [
          { type: 'text', text: `Feedback for the explanation: ${feedback}` },
        ],
      })
    }

    console.log(`[regenerateCrypticClueExplanation] Sending request via OpenRouter (${model})...`)
    const startTime = performance.now()

    const fetchPromise = client.chat.send({
      chatRequest: {
        model,
        messages,
        responseFormat: {
          type: 'json_schema',
          jsonSchema: {
            name: crypticSchema.name,
            strict: crypticSchema.strict,
            schema: crypticSchema.schema,
          },
        },
        plugins: [{ id: 'response-healing' }],
        maxTokens: 16000,
        stream: false,
      },
    })

    const timeoutPromise = new Promise<never>((_, reject) => {
      controller.signal.addEventListener('abort', () =>
        reject(new Error(`Request timed out after ${timeoutMs / 1000}s (model: ${model})`)),
      )
    })

    const result = await Promise.race([fetchPromise, timeoutPromise])
    const duration = (performance.now() - startTime) / 1000
    console.log(`[regenerateCrypticClueExplanation] Received response in ${duration.toFixed(2)}s`)

    const content = result?.choices[0]?.message.content

    if (!content) {
      throw new Error('No content received from OpenRouter')
    }

    if (typeof content !== 'string') {
      throw new Error('Expected string content from OpenRouter')
    }

    return JSON.parse(content)
  } finally {
    clearTimeout(timer)
  }
}

if (import.meta.main) {
  const args = Bun.argv.slice(2)
  if (args.length < 2) {
    console.error('Usage: bun utils/openrouter.ts "<clue>" "<answer>" [model-slug]')
    console.error('')
    console.error('Available model slugs:')
    for (const [key, slug] of Object.entries(models)) {
      console.error(`  ${key.padEnd(16)} ${slug}`)
    }
    process.exit(1)
  }

  const clue = args[0]!
  const answer = args[1]!
  const model = args[2] ?? models['gpt-5.4-mini']

  console.log(`Clue:   ${clue}`)
  console.log(`Answer: ${answer}`)
  console.log(`Model:  ${model}`)
  console.log()

  const start = performance.now()
  const result = await explainCrypticClue({ clue, answer, model })
  const elapsed = ((performance.now() - start) / 1000).toFixed(2)

  console.log(JSON.stringify(result, null, 2))
  console.log(`\nResponse time: ${elapsed}s`)
}
