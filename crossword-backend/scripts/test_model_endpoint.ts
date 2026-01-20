import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

async function main() {
  console.log('Testing standard chat completion with gpt-5-mini...')
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-5-mini',
      messages: [{ role: 'user', content: 'Hello' }],
    })
    console.log('Standard Chat Completion Success:', completion.choices[0].message)
  } catch (e) {
    console.error('Standard Chat Completion Failed:', e)
  }

  console.log("\nTesting Chat with 'input_text' type...")
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-5-mini',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'input_text' as any, text: 'Hello' }, // Casting to any because TS might complain
          ],
        },
      ],
    })
    console.log('Chat with input_text Success:', completion.choices[0].message)
  } catch (e) {
    console.error('Chat with input_text Failed:', e)
  }

  console.log("\nTesting 'responses' endpoint (if available)...")
  try {
    const response = await (openai as any).responses.create({
      model: 'gpt-5-mini',
      input: [{ role: 'user', content: 'Hello' }], // 'input' vs 'messages' matches openai.ts
    })
    console.log('Responses Endpoint Success:', response)
  } catch (e) {
    console.error('Responses Endpoint Failed:', e)
  }
}

main()
