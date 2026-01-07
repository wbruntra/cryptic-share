import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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
`;

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
  });

  const outputText = response.output_text;
  return JSON.parse(outputText);
}
