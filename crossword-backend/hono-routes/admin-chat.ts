import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { requireAdmin, type AuthUser } from '../hono-middleware/auth'
import { OpenRouter } from '@openrouter/sdk'
import { OPENROUTER_MODELS } from '../config'

type Variables = { user: AuthUser | null }

const adminChat = new Hono<{ Variables: Variables }>()

const CHAT_MODEL = OPENROUTER_MODELS['deepseek-flash']

const client = new OpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
})

adminChat.post('/', async (c) => {
  requireAdmin(c)

  const body = await c.req.json().catch(() => ({}))
  const { message } = body as { message?: string }

  if (!message || typeof message !== 'string') {
    throw new HTTPException(400, { message: 'Missing message field' })
  }

  const systemPrompt = `You are a helpful assistant for helping to build a cryptic crossword. Answer the user's question about crossword clues. Answer very concisely, for example if asked for three synonyms of "quick", you might reply "fast, swift, rapid". If asked for a word that means "a type of tree" and has 5 letters, you might reply "birch".`

  try {
    const result = await client.chat.send({
      chatRequest: {
        model: CHAT_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message },
        ],
        stream: false,
      },
    })

    const content = result?.choices[0]?.message.content
    if (!content) throw new Error('Empty response from model')

    return c.json({ reply: content })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Chat request failed'
    throw new HTTPException(502, { message: msg })
  }
})

export { adminChat }
