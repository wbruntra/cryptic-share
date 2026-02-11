import { transcribeAnswers } from '../utils/openai'
import { resolve } from 'path'

// Remove accent marks from string
const removeAccents = (str: string): string => {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

// ROT13 implementation
const rot13 = (str: string): string => {
  return str.replace(/[a-zA-Z]/g, (char) => {
    const base = char <= 'Z' ? 65 : 97
    return String.fromCharCode(((char.charCodeAt(0) - base + 13) % 26) + base)
  })
}

const main = async () => {
  const imagePath = Bun.argv[2]

  if (!imagePath) {
    console.error('Usage: bun scripts/transcribe-answers.ts <image_path>')
    process.exit(1)
  }

  try {
    const absolutePath = resolve(process.cwd(), imagePath)
    console.log(`Transcribing answers from ${absolutePath}...`)

    const file = Bun.file(absolutePath)
    const result = await transcribeAnswers(file)

    // Apply accent removal and ROT13 to all answers
    if (result.puzzles && Array.isArray(result.puzzles)) {
      result.puzzles.forEach((puzzle: any) => {
        if (puzzle.across) {
          puzzle.across.forEach((clue: any) => {
            if (clue.answer) clue.answer = rot13(removeAccents(clue.answer))
          })
        }
        if (puzzle.down) {
          puzzle.down.forEach((clue: any) => {
            if (clue.answer) clue.answer = rot13(removeAccents(clue.answer))
          })
        }
      })
    }

    const outputPath = 'transcribed_answers.json'
    await Bun.write(outputPath, JSON.stringify(result, null, 2))
    console.log(`Successfully saved ROT13 encoded answers to ${outputPath}`)
  } catch (error) {
    console.error('Error:', error)
    process.exit(1)
  }
}

if (import.meta.main) {
  main()
}
