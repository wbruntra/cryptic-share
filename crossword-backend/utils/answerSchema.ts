import { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'

// Define the Zod schema for crossword answers
const CrosswordAnswerSchema = z.object({
  number: z.number().int(),
  answer: z.string(),
}).strict()

const PuzzleAnswersSchema = z.object({
  puzzle_id: z.number().int(),
  across: z.array(CrosswordAnswerSchema),
  down: z.array(CrosswordAnswerSchema),
}).strict()

export const TranscribeAnswersSchema = z.object({
  puzzles: z.array(PuzzleAnswersSchema),
}).strict()

// Convert Zod schema to JSON Schema and wrap it in OpenAI's format
const jsonSchema = zodToJsonSchema(TranscribeAnswersSchema, {
  $refStrategy: 'none',
})

// Export the JSON Schema format for OpenAI API
export const transcribeAnswersJsonSchema = {
  type: 'json_schema',
  name: 'transcribe_answers',
  strict: true,
  schema: jsonSchema,
}

// Type inference
export type TranscribeAnswersResponse = z.infer<typeof TranscribeAnswersSchema>
export type PuzzleAnswers = z.infer<typeof PuzzleAnswersSchema>
export type CrosswordAnswer = z.infer<typeof CrosswordAnswerSchema>
