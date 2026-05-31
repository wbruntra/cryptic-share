import { describe, test, expect } from 'bun:test'
import {
  CrypticExplanationZodSchema,
  crypticSchemaFromZod,
  type CrypticExplanation,
} from '../utils/crypticSchema'

describe('crypticSchema (Zod)', () => {
  test('should generate valid JSON Schema', () => {
    const jsonSchema = crypticSchemaFromZod

    // Verify the wrapper structure for OpenAI
    expect(jsonSchema.type).toBe('json_schema')
    expect(jsonSchema.name).toBe('cryptic_explanation_zod')
    expect(jsonSchema.strict).toBe(true)
    expect(jsonSchema.schema).toBeDefined()

    // Verify the schema structure
    expect(jsonSchema.schema.type).toBe('object')
    expect(jsonSchema.schema.properties).toBeDefined()
    expect(jsonSchema.schema.properties?.clue_type).toBeDefined()
    expect(jsonSchema.schema.properties?.explanation).toBeDefined()

    console.log('Generated Zod JSON Schema:', JSON.stringify(jsonSchema.schema, null, 2))
  })

  test('should validate wordplay clue', () => {
    const validWordplay: CrypticExplanation = {
      clue_type: 'wordplay',
      explanation: {
        clue_type: 'wordplay',
        clue_segmentation: [
          { text: 'Germany', role: 'wordplay' },
          { text: 'seized', role: 'indicator' },
          { text: 'Peru', role: 'wordplay' },
          { text: 'illegally', role: 'indicator' },
          { text: 'gives', role: 'link' },
          { text: 'took', role: 'definition' },
          { text: 'over', role: 'definition' },
        ],
        definition: 'took over',
        wordplay_steps: [
          {
            tokens: 'Germany Peru illegally',
            operation: 'Anagram of URPED',
            result: 'URPED',
            clue_after: 'US URPED gives took over',
          },
          {
            tokens: 'US URPED',
            operation: 'Concatenate US + URPED',
            result: 'USURPED',
            clue_after: 'USURPED gives took over',
          },
        ],
        hint: {
          definition_location: 'end',
          wordplay_types: ['abbreviation', 'anagram'],
        },
        full_explanation:
          'US (America) followed by an anagram of URPED (Germany seized Peru illegally) gives USURPED (took over).',
      },
    }

    const result = CrypticExplanationZodSchema.safeParse(validWordplay)
    expect(result.success).toBe(true)
  })

  test('should validate double definition clue', () => {
    const validDoubleDefinition: CrypticExplanation = {
      clue_type: 'double_definition',
      explanation: {
        clue_type: 'double_definition',
        clue_segmentation: [
          { text: 'current', role: 'definition' },
          { text: 'berry', role: 'definition' },
        ],
        definitions: [
          {
            definition: 'current',
            sense: 'Electric current',
          },
          {
            definition: 'berry',
            sense: 'A type of fruit',
          },
        ],
        hint: {
          definition_count: 2,
        },
        full_explanation: 'CURRENT means both electric current and a type of berry.',
      },
    }

    const result = CrypticExplanationZodSchema.safeParse(validDoubleDefinition)
    expect(result.success).toBe(true)
  })

  test('should validate &lit clue', () => {
    const validAndLit: CrypticExplanation = {
      clue_type: '&lit',
      explanation: {
        clue_type: '&lit',
        definition_scope: 'entire_clue',
        clue_segmentation: [
          { text: 'confused', role: 'indicator' },
          { text: 'customers', role: 'wordplay' },
        ],
        wordplay_steps: [
          {
            tokens: 'confused customers',
            operation: 'Anagram of CUSTOMERS',
            result: 'CUSTOMERS',
            clue_after: 'CUSTOMERS',
          },
        ],
        hint: {
          wordplay_types: ['anagram'],
        },
        full_explanation: 'The entire clue is an anagram of CUSTOMERS.',
      },
    }

    const result = CrypticExplanationZodSchema.safeParse(validAndLit)
    expect(result.success).toBe(true)
  })

  test('should validate cryptic definition clue', () => {
    const validCrypticDefinition: CrypticExplanation = {
      clue_type: 'cryptic_definition',
      explanation: {
        clue_type: 'cryptic_definition',
        definition_scope: 'entire_clue',
        clue_segmentation: [
          { text: 'A', role: 'definition' },
          { text: 'puzzle', role: 'definition' },
        ],
        definition_paraphrase: 'Something that can be used to describe a puzzle or mystery',
        hint: {
          definition_scope: 'entire_clue',
        },
        full_explanation: 'The whole clue cryptically defines the answer.',
      },
    }

    const result = CrypticExplanationZodSchema.safeParse(validCrypticDefinition)
    expect(result.success).toBe(true)
  })

  test('should validate no_clean_parse clue', () => {
    const validNoCleanParse: CrypticExplanation = {
      clue_type: 'no_clean_parse',
      explanation: {
        clue_type: 'no_clean_parse',
        intended_clue_type: 'wordplay',
        clue_segmentation: [
          { text: 'missing', role: 'link' },
          { text: 'indicator', role: 'definition' },
        ],
        definition: 'the answer',
        issue: 'Missing indicator for reversal operation',
        hint: {
          intended_clue_type: 'wordplay',
        },
        full_explanation: 'Cannot parse cleanly due to missing reversal indicator.',
      },
    }

    const result = CrypticExplanationZodSchema.safeParse(validNoCleanParse)
    expect(result.success).toBe(true)
  })

  test('should reject mismatched clue_type', () => {
    const invalid = {
      clue_type: 'wordplay',
      explanation: {
        clue_type: 'double_definition', // Mismatch!
        clue_segmentation: [
          { text: 'test', role: 'definition' },
        ],
        definitions: [
          { definition: 'test', sense: 'test' },
          { definition: 'test2', sense: 'test2' },
        ],
        hint: { definition_count: 2 },
        full_explanation: 'Test',
      },
    }

    const result = CrypticExplanationZodSchema.safeParse(invalid as any)
    expect(result.success).toBe(false)
  })

  test('should reject missing required fields', () => {
    const invalid = {
      clue_type: 'wordplay',
      explanation: {
        clue_type: 'wordplay',
        // Missing clue_segmentation, definition, wordplay_steps, hint, full_explanation
      },
    }

    const result = CrypticExplanationZodSchema.safeParse(invalid as any)
    expect(result.success).toBe(false)
  })

  test('should reject extra fields in strict mode', () => {
    const invalid = {
      clue_type: 'wordplay',
      explanation: {
        clue_type: 'wordplay',
        clue_segmentation: [
          { text: 'test', role: 'wordplay' },
        ],
        definition: 'test',
        wordplay_steps: [{ tokens: 'test', operation: 'test', result: 'TEST', clue_after: 'TEST' }],
        hint: {
          definition_location: 'end',
          wordplay_types: ['test'],
        },
        full_explanation: 'Test',
        extra_field: 'not allowed', // Extra field
      },
    }

    const result = CrypticExplanationZodSchema.safeParse(invalid as any)
    expect(result.success).toBe(false)
  })

  test('should reject double_definition with less than 2 definitions', () => {
    const invalid = {
      clue_type: 'double_definition',
      explanation: {
        clue_type: 'double_definition',
        clue_segmentation: [
          { text: 'test', role: 'definition' },
        ],
        definitions: [
          { definition: 'only one', sense: 'test' }, // Should have at least 2
        ],
        hint: { definition_count: 2 },
        full_explanation: 'Test',
      },
    }

    const result = CrypticExplanationZodSchema.safeParse(invalid as any)
    expect(result.success).toBe(false)
  })

  test('should reject empty arrays where minItems is set', () => {
    const invalid = {
      clue_type: 'wordplay',
      explanation: {
        clue_type: 'wordplay',
        clue_segmentation: [], // Should have at least 1 item
        definition: 'test',
        wordplay_steps: [{ tokens: 'test', operation: 'test', result: 'TEST', clue_after: 'TEST' }],
        hint: {
          definition_location: 'end',
          wordplay_types: ['test'],
        },
        full_explanation: 'Test',
      },
    }

    const result = CrypticExplanationZodSchema.safeParse(invalid as any)
    expect(result.success).toBe(false)
  })
})
