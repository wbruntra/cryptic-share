/**
 * test-gpt-luna.ts
 *
 * Smoke test for an OpenRouter model against sample cryptic clues, run with
 * reasoning effort: high. Uses the shared crypticInstructions/crypticSchema
 * by default, or a minimal freeform prompt with --plain.
 *
 * Usage:
 *   bun scripts/test-gpt-luna.ts [model-slug] [clue-index...] [--plain]
 *
 * Examples:
 *   bun scripts/test-gpt-luna.ts                                 # gpt-5.6-luna, clues 1-3
 *   bun scripts/test-gpt-luna.ts google/gemini-3.5-flash-lite 3   # gemini 3.5 flash lite, clue 3 only
 *   bun scripts/test-gpt-luna.ts openai/gpt-5.6-luna 3 --plain    # luna, clue 3, no schema/instructions
 */

import { OpenRouter } from '@openrouter/sdk'
import { crypticSchema, crypticInstructions } from '../utils/crypticSchema'
import { OPENROUTER_MODELS } from '../config'
import sampleClues from '../samples/sample-clues.json'

const rawArgs = Bun.argv.slice(2)
const PLAIN = rawArgs.includes('--plain')
const cliArgs = rawArgs.filter((a) => a !== '--plain')
const MODEL = cliArgs[0] ?? OPENROUTER_MODELS['gpt-luna']
const clueIndices = cliArgs.slice(1).map((n) => parseInt(n, 10) - 1)

const client = new OpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
})

async function explainClue(clue: string, answer: string) {
  if (PLAIN) {
    const result = await client.chat.send({
      chatRequest: {
        model: MODEL,
        provider: { sort: 'price' },
        reasoning: { effort: 'high' },
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Explain this cryptic crossword clue and answer.\n\nClue: ${clue}\nAnswer: ${answer}`,
              },
            ],
          },
        ],
        stream: false,
      },
    })

    const content = result?.choices[0]?.message.content
    if (!content) throw new Error('No content received from OpenRouter')
    if (typeof content !== 'string') throw new Error('Expected string content from OpenRouter')
    return content
  }

  const result = await client.chat.send({
    chatRequest: {
      model: MODEL,
      reasoning: { effort: 'high' },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: crypticInstructions },
            { type: 'text', text: `Clue: ${clue}\nAnswer: ${answer}` },
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

  const content = result?.choices[0]?.message.content
  if (!content) throw new Error('No content received from OpenRouter')
  if (typeof content !== 'string') throw new Error('Expected string content from OpenRouter')
  return JSON.parse(content)
}

async function main() {
  const testClues = clueIndices.length > 0
    ? clueIndices.map((i) => sampleClues[i]!)
    : sampleClues.slice(0, 3)

  console.log(`Model: ${MODEL}`)
  console.log(`Reasoning effort: high`)
  console.log(`Testing ${testClues.length} clues\n`)

  for (const [i, { clue, answer }] of testClues.entries()) {
    console.log('─'.repeat(60))
    console.log(`[${i + 1}/${testClues.length}] Clue:   ${clue}`)
    console.log(`Answer: ${answer}`)

    const start = performance.now()
    try {
      const explanation = await explainClue(clue, answer)
      const elapsed = ((performance.now() - start) / 1000).toFixed(2)
      console.log(`\n${typeof explanation === 'string' ? explanation : JSON.stringify(explanation, null, 2)}`)
      console.log(`\nResponse time: ${elapsed}s`)
    } catch (err: any) {
      const elapsed = ((performance.now() - start) / 1000).toFixed(2)
      console.error(`\nERROR after ${elapsed}s: ${err?.message ?? err}`)
    }
    console.log()
  }
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
