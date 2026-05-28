import { OpenRouter } from '@openrouter/sdk'

const client = new OpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
})

const MODEL = 'deepseek/deepseek-v4-flash'

function verifyAnagram(
  fodder: string,
  target: string,
): {
  is_anagram: boolean
  fodder: string
  target: string
  fodder_sorted: string
  target_sorted: string
} {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z]/g, '')
      .split('')
      .sort()
      .join('')
  const fodderNormalized = normalize(fodder)
  const targetNormalized = normalize(target)
  return {
    is_anagram: fodderNormalized === targetNormalized,
    fodder,
    target,
    fodder_sorted: fodderNormalized,
    target_sorted: targetNormalized,
  }
}

const tools = [
  {
    type: 'function' as const,
    function: {
      name: 'verify_anagram',
      description:
        'Verify that a fodder string can be anagrammed into a target string. The function normalizes both strings (lowercase, remove non-letters), sorts the letters, and checks if they match. Only use this to verify candidate anagrams.',
      parameters: {
        type: 'object' as const,
        properties: {
          fodder: { type: 'string', description: 'The source string of letters to rearrange' },
          target: {
            type: 'string',
            description: 'The target string to check if it can be formed from the fodder',
          },
        },
        required: ['fodder', 'target'],
      },
    },
  },
]

const TOOL_MAPPING: Record<string, (args: any) => any> = {
  verify_anagram: (args: { fodder: string; target: string }) =>
    verifyAnagram(args.fodder, args.target),
}

async function main() {
  const task = `Find a cricket term that is an anagram of "we stick". You MUST call verify_anagram to check any candidate — do NOT guess or conclude without verification. The definition of a "cricket term" is: a word commonly used in the sport of cricket (e.g. positions, equipment, scoring terms, etc.).`

  const messages: any[] = [
    {
      role: 'system',
      content:
        'You are a helpful assistant that solves anagram puzzles. You MUST call the verify_anagram tool to verify EVERY candidate anagram before presenting your answer. Never conclude without tool verification, even if you are confident.',
    },
    {
      role: 'user',
      content: task,
    },
  ]

  const maxIterations = 5
  let iterationCount = 0

  while (iterationCount < maxIterations) {
    iterationCount++
    console.log(`\n--- Iteration ${iterationCount} ---`)

    const chatRequest: any = { model: MODEL, tools, messages }
    if (iterationCount === 1) {
      chatRequest.tool_choice = { type: 'function', function: { name: 'verify_anagram' } }
    }

    const result = await client.chat.send({ chatRequest })

    const message = result.choices[0].message
    messages.push(message)

    if (message.toolCalls?.length) {
      console.log(`Model requested ${message.toolCalls.length} tool call(s):`)
      for (const toolCall of message.toolCalls) {
        const toolName = toolCall.function.name
        const toolArgs = JSON.parse(toolCall.function.arguments)
        console.log(`  -> ${toolName}(${JSON.stringify(toolArgs)})`)

        const toolResult = TOOL_MAPPING[toolName]?.(toolArgs) ?? {
          error: `Unknown tool: ${toolName}`,
        }
        console.log(`  <- Result: ${JSON.stringify(toolResult)}`)

        messages.push({
          role: 'tool',
          toolCallId: toolCall.id,
          content: JSON.stringify(toolResult),
        })
      }
    } else {
      console.log(`\nFinal response: ${message.content}`)
      break
    }
  }

  if (iterationCount >= maxIterations) {
    console.warn('\nWarning: Maximum iterations reached')
    console.log(`Last message: ${messages[messages.length - 1]?.content}`)
  }
}

main().catch(console.error)
