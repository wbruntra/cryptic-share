import { GoogleGenAI } from '@google/genai'
import { resolve } from 'path'
import path from 'path'
import secrets from './secrets.js'

export const generateGrid = async (file) => {
  // 2. Initialize Gemini Client
  const client = new GoogleGenAI({ apiKey: secrets.GEMINI_API_KEY })

  // 3. Prepare the image using Bun's native file API
  const arrayBuffer = await file.arrayBuffer()
  const base64Data = Buffer.from(arrayBuffer).toString('base64')

  // 4. Define the specific prompt to enforce the W/B/N format
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
    // 5. Call the API with structured JSON output enforced
    const response = await client.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [
        {
          role: 'user',
          parts: [
            { text: promptText },
            {
              inlineData: {
                mimeType: file.type || 'image/jpeg',
                data: base64Data,
              },
            },
          ],
        },
      ],
      config: {
        responseMimeType: 'application/json',
      },
    })

    // 6. Extract and parse the JSON result
    const jsonOutput = response.text
    return JSON.parse(jsonOutput)
  } catch (error) {
    console.error('Error parsing grid:', error)
  }
}

const test = async () => {
  // 1. Get arguments
  const imagePath = path.join(__dirname, 'images', 'grid_21.jpg')
  const file = Bun.file(resolve(imagePath))

  const gridData = await generateGrid(file)
  console.log('Generated Grid Data:', gridData)
}

if (import.meta.main) {
  await test()
}
