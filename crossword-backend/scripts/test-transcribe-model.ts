/**
 * Quick test: transcribe page 1 of a PDF/image with a given model.
 *
 * USAGE:
 *   bun scripts/test-transcribe-model.ts <file> <model> [clues|answers] [--sdk openai|openrouter]
 *
 * EXAMPLES:
 *   bun scripts/test-transcribe-model.ts images/clues_97_100.pdf google/gemma-4-26b-a4b-it clues
 *   bun scripts/test-transcribe-model.ts images/answers_29_32.jpg openai/gpt-5.4-nano answers
 *   bun scripts/test-transcribe-model.ts images/answers_29_32.jpg gpt-5.4-nano answers --sdk openai
 */

import { tmpdir } from 'os'
import { resolve } from 'path'

const args = Bun.argv.slice(2)
const sdkFlagIdx = args.indexOf('--sdk')
const sdk = sdkFlagIdx !== -1 ? args.splice(sdkFlagIdx, 2)[1] : 'openrouter'

const [filePath, model, mode = 'answers'] = args

if (!filePath || !model) {
  console.error('Usage: bun scripts/test-transcribe-model.ts <file> <model> [clues|answers] [--sdk openai|openrouter]')
  process.exit(1)
}

if (mode !== 'clues' && mode !== 'answers') {
  console.error(`Unknown mode "${mode}". Use "clues" or "answers".`)
  process.exit(1)
}

if (sdk !== 'openai' && sdk !== 'openrouter') {
  console.error(`Unknown sdk "${sdk}". Use "openai" or "openrouter".`)
  process.exit(1)
}

const resolved = resolve(process.cwd(), filePath)
const isPdf = resolved.toLowerCase().endsWith('.pdf')

console.log(`File:  ${resolved}`)
console.log(`Model: ${model}`)
console.log(`Mode:  ${mode}`)
console.log(`SDK:   ${sdk}`)

let imagePath: string

if (isPdf) {
  console.log('\nConverting page 1 to image...')
  const prefix = `${tmpdir()}/test_transcribe_${Date.now()}_page`
  const result = await Bun.$`pdftoppm -jpeg -r 200 -f 1 -l 1 ${resolved} ${prefix}`.quiet().nothrow()
  if (result.exitCode !== 0) {
    console.error('pdftoppm failed:', result.stderr.toString())
    process.exit(1)
  }
  const glob = new Bun.Glob(`${prefix}-*.jpg`)
  const files: string[] = []
  for await (const f of glob.scan('/')) files.push(f)
  files.sort()
  if (!files[0]) {
    console.error('No image produced by pdftoppm')
    process.exit(1)
  }
  imagePath = files[0]
} else {
  imagePath = resolved
}

console.log(`Image: ${imagePath}`)
console.log('\nTranscribing...\n')

const start = performance.now()
const imageBuffer = await Bun.file(imagePath).arrayBuffer()
const base64 = Buffer.from(imageBuffer).toString('base64')

let transcription: any

if (sdk === 'openai') {
  const { transcribeAnswers, getCrosswordClues } = await import('../utils/openai')
  transcription = mode === 'clues'
    ? await getCrosswordClues(base64)
    : await transcribeAnswers({ base64, mimeType: 'image/jpeg' }, model)
} else {
  const { transcribeAnswers, getCrosswordClues } = await import('../utils/openrouter')
  transcription = mode === 'clues'
    ? await getCrosswordClues(base64, model)
    : await transcribeAnswers({ base64, mimeType: 'image/jpeg' }, model)
}

const elapsed = ((performance.now() - start) / 1000).toFixed(2)

console.log(JSON.stringify(transcription, null, 2))
console.log(`\nResponse time: ${elapsed}s`)
