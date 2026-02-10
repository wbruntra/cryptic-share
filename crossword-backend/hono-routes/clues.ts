import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { adminMiddleware, type AuthUser } from '../hono-middleware/auth'
import { getCrosswordClues } from '../utils/openai'

type Variables = { user: AuthUser | null }

const clues = new Hono<{ Variables: Variables }>()

// POST /api/clues/from-image - Transcribe clues from image
clues.post('/from-image', adminMiddleware, async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const { image } = body

  if (!image) {
    throw new HTTPException(400, { message: 'Missing image data' })
  }

  const base64Image = image.replace(/^data:image\/\w+;base64,/, '')

  try {
    const transcribedClues = await getCrosswordClues(base64Image)
    return c.json(transcribedClues)
  } catch (error: any) {
    console.error('Error transcribing clues:', error)
    throw new HTTPException(500, { message: 'Failed to transcribe clues' })
  }
})

export { clues }
