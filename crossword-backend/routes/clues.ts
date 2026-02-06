import { Router, jsonResponse, HttpError, type Context } from '../http/router'
import { getCrosswordClues } from '../utils/openai'

export function registerClueRoutes(router: Router) {
  router.post('/api/clues/from-image', handleTranscribeClues)
}

// Transcribe clues from image
async function handleTranscribeClues(ctx: Context) {
  const body = ctx.body as any
  const { image } = body || {}

  if (!image) {
    throw new HttpError(400, { error: 'Missing image data' })
  }

  const base64Image = image.replace(/^data:image\/\w+;base64,/, '')

  try {
    const clues = await getCrosswordClues(base64Image)
    return jsonResponse(clues)
  } catch (error: any) {
    console.error('Error transcribing clues:', error)
    throw new HttpError(500, { error: 'Failed to transcribe clues', details: error.message })
  }
}
