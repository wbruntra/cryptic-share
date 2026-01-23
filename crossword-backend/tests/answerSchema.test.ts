import { describe, test, expect } from 'bun:test'
import { z } from 'zod'
import {
  transcribeAnswersJsonSchema,
  TranscribeAnswersSchema,
  type TranscribeAnswersResponse,
} from '../utils/answerSchema'

describe('answerSchema', () => {
  test('should generate valid JSON Schema', () => {
    const jsonSchema = transcribeAnswersJsonSchema

    // Verify the wrapper structure for OpenAI
    expect(jsonSchema.type).toBe('json_schema')
    expect(jsonSchema.name).toBe('transcribe_answers')
    expect(jsonSchema.strict).toBe(true)
    expect(jsonSchema.schema).toBeDefined()

    // Verify the schema structure
    expect(jsonSchema.schema.type).toBe('object')
    expect(jsonSchema.schema.properties).toBeDefined()
    expect(jsonSchema.schema.properties.puzzles).toBeDefined()
    expect(jsonSchema.schema.properties.puzzles.type).toBe('array')

    // Verify puzzle structure
    const puzzleSchema = jsonSchema.schema.properties.puzzles.items
    expect(puzzleSchema.type).toBe('object')
    expect(puzzleSchema.properties.puzzle_id).toBeDefined()
    expect(puzzleSchema.properties.across).toBeDefined()
    expect(puzzleSchema.properties.down).toBeDefined()

    // Verify answer structure
    const acrossSchema = puzzleSchema.properties.across.items
    expect(acrossSchema.type).toBe('object')
    expect(acrossSchema.properties.number).toBeDefined()
    expect(acrossSchema.properties.number.type).toBe('integer')
    expect(acrossSchema.properties.answer).toBeDefined()
    expect(acrossSchema.properties.answer.type).toBe('string')
  })

  test('should validate correct data', () => {
    const validData: TranscribeAnswersResponse = {
      puzzles: [
        {
          puzzle_id: 1,
          across: [
            { number: 1, answer: 'HELLO' },
            { number: 3, answer: 'WORLD' },
          ],
          down: [
            { number: 2, answer: 'EXAMPLE' },
            { number: 4, answer: 'TEST' },
          ],
        },
      ],
    }

    const result = TranscribeAnswersSchema.safeParse(validData)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual(validData)
    }
  })

  test('should reject invalid data - missing required field', () => {
    const invalidData = {
      puzzles: [
        {
          puzzle_id: 1,
          across: [
            { number: 1 }, // missing 'answer'
          ],
          down: [],
        },
      ],
    }

    const result = TranscribeAnswersSchema.safeParse(invalidData)
    expect(result.success).toBe(false)
  })

  test('should reject invalid data - wrong type', () => {
    const invalidData = {
      puzzles: [
        {
          puzzle_id: 'not a number', // should be number
          across: [],
          down: [],
        },
      ],
    }

    const result = TranscribeAnswersSchema.safeParse(invalidData)
    expect(result.success).toBe(false)
  })

  test('should reject invalid data - non-integer number', () => {
    const invalidData = {
      puzzles: [
        {
          puzzle_id: 1.5, // should be integer
          across: [],
          down: [],
        },
      ],
    }

    const result = TranscribeAnswersSchema.safeParse(invalidData)
    expect(result.success).toBe(false)
  })

  test('should reject invalid data - extra fields (strict mode)', () => {
    const invalidData = {
      puzzles: [
        {
          puzzle_id: 1,
          across: [],
          down: [],
          extra_field: 'not allowed', // extra field
        },
      ],
    }

    const result = TranscribeAnswersSchema.safeParse(invalidData)
    expect(result.success).toBe(false)
  })

  test('should handle multiple puzzles', () => {
    const validData: TranscribeAnswersResponse = {
      puzzles: [
        {
          puzzle_id: 1,
          across: [{ number: 1, answer: 'FIRST' }],
          down: [{ number: 2, answer: 'SECOND' }],
        },
        {
          puzzle_id: 2,
          across: [{ number: 1, answer: 'THIRD' }],
          down: [{ number: 2, answer: 'FOURTH' }],
        },
      ],
    }

    const result = TranscribeAnswersSchema.safeParse(validData)
    expect(result.success).toBe(true)
  })

  test('should handle empty arrays', () => {
    const validData: TranscribeAnswersResponse = {
      puzzles: [
        {
          puzzle_id: 1,
          across: [],
          down: [],
        },
      ],
    }

    const result = TranscribeAnswersSchema.safeParse(validData)
    expect(result.success).toBe(true)
  })

  test('JSON Schema should match expected structure', () => {
    const schema = transcribeAnswersJsonSchema.schema

    // Print the schema for debugging
    console.log('Generated JSON Schema:', JSON.stringify(schema, null, 2))

    // Verify required fields
    expect(schema.required).toContain('puzzles')
    expect(schema.additionalProperties).toBe(false)

    // Verify puzzle item schema
    const puzzleItemSchema = schema.properties.puzzles.items
    expect(puzzleItemSchema.required).toEqual(
      expect.arrayContaining(['puzzle_id', 'across', 'down']),
    )
    expect(puzzleItemSchema.additionalProperties).toBe(false)

    // Verify answer item schema
    const answerItemSchema = puzzleItemSchema.properties.across.items
    expect(answerItemSchema.required).toEqual(expect.arrayContaining(['number', 'answer']))
    expect(answerItemSchema.additionalProperties).toBe(false)
  })
})
