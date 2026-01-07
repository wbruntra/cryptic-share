import fs from 'fs'
import OpenAI from 'openai'
import path from 'path'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export const getCrosswordGrid = async (base64Image) => {
  const instructions = `
You are digitizing a crossword grid from an image.

Task: Crossword Grid Digitization

1. Analyze the Grid: Identify the dimensions (e.g., 15x15).

2. Identify Square Types:
   - B (Black): Solid blocks where no letters are placed.
   - N (Numbered): Any white square containing a small digit in the corner.
   - W (White): Empty playable squares with no numbers.

3. Strict Output Format:
   - Provide the grid as rows of text (one row per line).
   - Separate each cell character with a single space.
   - Do not include the actual numbers; use the letter N to represent any numbered square.
   - Ensure every row has exactly the correct number of cells for the grid.

4. Return ONLY valid JSON in the following format:

{
  "dimensions": { "rows": <integer>, "columns": <integer> },
  "grid": [
    <string>,
    <string>,
    ...
  ]
}

Where each grid row is a string of space-separated cell characters (B, N, or W).

Rules:
- Do not include any commentary, markdown, or extra text.
- Ensure all rows have the same number of cells.
`

  const response = await openai.responses.create({
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

  // The model is constrained to JSON, so this should be safe
  const outputText = response.output_text
  return JSON.parse(outputText)
}

export const getCrosswordClues = async (base64Image) => {
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

  const response = await openai.responses.create({
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

  // The model is constrained to JSON, so this should be safe
  const outputText = response.output_text
  return JSON.parse(outputText)
}

const run = async () => {
  const imageName = 'clues_18.jpg'

  const imagePath = path.join(__dirname, 'images', imageName)
  const base64Image = fs.readFileSync(imagePath, 'base64')

  const result = await getCrosswordClues(base64Image)

  console.log(JSON.stringify(result, null, 2))

  fs.writeFileSync(
    path.join(__dirname, 'outputs', `clues_${imageName.split('.')[0]}.json`),
    JSON.stringify(result, null, 2),
  )
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch(console.error)
}
