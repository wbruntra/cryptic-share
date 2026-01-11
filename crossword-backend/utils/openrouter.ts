import { OpenRouter } from '@openrouter/sdk'
import { resolve } from 'path'
import * as path from 'path'

const client = new OpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
})

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
    // @ts-ignore - The OpenRouter SDK might have dynamic types or I might be guessing the method if the type defs aren't perfect, but adhering to user example.
    const result = await client.chat.send({
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
      stream: false,
    })

    // Parse the result
    const content = result?.choices[0]?.message.content

    if (!content) {
      throw new Error('No content received from OpenRouter')
    }

    if (typeof content !== 'string') {
      throw new Error('Expected string content from OpenRouter')
    }

    // With responseFormat, the content should already be valid JSON
    return JSON.parse(content)
  } catch (error) {
    console.error('Error parsing grid:', error)
    throw error
  }
}

const test = async () => {
  const response = await client.chat.send({
    model: 'google/gemini-3-flash-preview',
    messages: [
      {
        role: 'user',
        content:
          'What is the weather like in London? (just invent a plausible answer for Jan 11 2026',
      },
    ],
    responseFormat: {
      type: 'json_schema',
      jsonSchema: {
        name: 'weather',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            location: {
              type: 'string',
              description: 'City or location name',
            },
            temperature: {
              type: 'number',
              description: 'Temperature in Celsius',
            },
            conditions: {
              type: 'string',
              description: 'Weather conditions description',
            },
          },
          required: ['location', 'temperature', 'conditions'],
          additionalProperties: false,
        },
      },
    },
    stream: false,
  })

  const weatherInfo = response?.choices[0]?.message.content

  console.log(weatherInfo)

  if (typeof weatherInfo !== 'string') {
    throw new Error('Expected string content from OpenRouter')
  }

  return JSON.parse(weatherInfo)
}

if (import.meta.main) {
  console.log(await test())
}
