import OpenAI from 'openai'
import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'

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

  const instructions = `
You are a cryptic crossword expert explaining a solved clue.

You will be given:
- A cryptic crossword clue
- The correct answer

Your task:
1. Identify the exact definition in the clue (quote it verbatim).
2. Identify a single, clean wordplay parse that leads to the answer.
3. Provide both a hint and a full explanation.

Core cryptic rules (strict):
- Each part of the wordplay MUST correspond to one explicit indicator in the clue.
- Use the simplest valid parse; do not offer alternatives or supporting interpretations.
- Do NOT mix mechanisms (e.g. hidden letters, charades, containers) unless the clue explicitly indicates them.
- Every letter in the answer MUST be explicitly justified.
- Do not invent extra indicators, padding, or explanatory glue.
- If a clean parse cannot be produced, state that the clue is loose or flawed rather than inventing one.

Letter accounting (mandatory):
- Break the answer into its component letter groups.
- For each group, state exactly which indicator produced it.
- The concatenation of all letter groups MUST exactly equal the answer.

Style constraints:
- Write like a crossword setter explaining a clue to another setter.
- Be concise and literal.
- Avoid hedging or justification language such as “also”, “alternatively”, “supported by”, or “equivalently”.
- Do not explain basic cryptic conventions unless necessary.

Output format:
Return ONLY valid JSON in the following format:

{
  "definition": <string>,
  "letter_breakdown": [
    { "source": <string>, "letters": <string> }
  ],
  "wordplay_steps": [
    {
      "indicator": <string>,
      "operation": <string>,
      "result": <string>
    }
  ],
  "hint": {
    "definition_location": "start" | "end",
    "wordplay_types": <string[]>
  },
  "full_explanation": <string>
}

Hint mode behavior:
- If mode is "hint", keep the explanation non-spoilery.
- Do not explicitly assemble the answer in the explanation.
- Still include correct letter accounting internally.

Final check (required):
- Verify that the letter_breakdown concatenates exactly to the answer.

Constraints:
- full_explanation must be at most 4 sentences.
- Do not restate the clue.
`

  const response = await (openai as any).responses.create({
    model: 'gpt-5-mini',
    reasoning: { effort: 'medium' },
    input: [
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: `
Clue: ${clue}
Answer: ${answer}
Mode: ${mode}
          `.trim(),
          },
          { type: 'input_text', text: instructions },
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
}

const test = async () => {
  const input = {
    clue: "Section of Mafia's courting disaster (6)",
    answer: 'FIASCO',
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
