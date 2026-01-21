import db from '../db-knex'
import { explainCrypticClue } from '../utils/openrouter'
import { assertValidExplanation } from '../utils/validateExplanation'

export type FlatClueExplanation =
  | WordplayExplanation
  | DoubleDefinitionExplanation
  | AndLitExplanation
  | CrypticDefinitionExplanation
  | NoCleanParseExplanation

// Model/API response format (nested with clue_type + explanation)
export interface StoredClueExplanation {
  clue_type:
    | 'wordplay'
    | 'double_definition'
    | '&lit'
    | 'cryptic_definition'
    | 'no_clean_parse'
  explanation: FlatClueExplanation
}

export interface WordplayExplanation {
  clue_type: 'wordplay'
  definition: string
  letter_breakdown: Array<{ source: string; letters: string }>
  wordplay_steps: Array<{ indicator: string; operation: string; result: string }>
  hint: {
    definition_location: 'start' | 'end'
    wordplay_types: string[]
  }
  full_explanation: string
}

export interface DoubleDefinitionExplanation {
  clue_type: 'double_definition'
  definitions: Array<{
    definition: string
    sense: string
  }>
  hint: {
    definition_count: 2
  }
  full_explanation: string
}

export interface AndLitExplanation {
  clue_type: '&lit'
  definition_scope: 'entire_clue'
  letter_breakdown: Array<{ source: string; letters: string }>
  wordplay_steps: Array<{ indicator: string; operation: string; result: string }>
  hint: {
    wordplay_types: string[]
  }
  full_explanation: string
}

export interface CrypticDefinitionExplanation {
  clue_type: 'cryptic_definition'
  definition_scope: 'entire_clue'
  definition_paraphrase: string
  hint: {
    definition_scope: 'entire_clue'
  }
  full_explanation: string
}

export interface NoCleanParseExplanation {
  clue_type: 'no_clean_parse'
  intended_clue_type: 'wordplay' | 'double_definition' | '&lit' | 'cryptic_definition'
  issue: string
  hint: {
    intended_clue_type: 'wordplay' | 'double_definition' | '&lit' | 'cryptic_definition'
  }
  full_explanation: string
}

// OLD FORMAT (for backward compatibility)
interface OldClueExplanation {
  definition?: string
  letter_breakdown?: Array<{ source: string; letters: string }>
  wordplay_steps?: Array<{ indicator: string; operation: string; result: string }>
  hint?: {
    definition_location?: 'start' | 'end'
    wordplay_types?: string[]
  }
  full_explanation?: string
}

interface StoredExplanation {
  id: number
  puzzle_id: number
  clue_number: number
  direction: string
  clue_text: string
  answer: string
  explanation_json: string
  created_at: string
}

const extractInnerExplanationForStorage = (
  data: StoredClueExplanation | FlatClueExplanation,
): FlatClueExplanation => {
  if ((data as any)?.explanation && (data as any)?.clue_type) {
    return (data as StoredClueExplanation).explanation
  }

  if ((data as any)?.clue_type) {
    return data as FlatClueExplanation
  }

  return {
    clue_type: 'wordplay',
    ...(data as any),
  } as FlatClueExplanation
}

const normalizeForClient = (data: any): FlatClueExplanation => {
  if (data?.explanation) {
    const inner = data.explanation
    if (inner?.clue_type) {
      return inner as FlatClueExplanation
    }

    if (data?.clue_type) {
      return {
        clue_type: data.clue_type,
        ...(inner ?? {}),
      } as FlatClueExplanation
    }
  }

  if (data?.clue_type) {
    return data as FlatClueExplanation
  }

  return {
    clue_type: 'wordplay',
    ...(data ?? {}),
  } as FlatClueExplanation
}

export class ExplanationService {
  /**
   * Get an existing explanation from the cache
   */
  static async getCachedExplanation(
    puzzleId: number,
    clueNumber: number,
    direction: string,
  ): Promise<FlatClueExplanation | null> {
    const row = await db<StoredExplanation>('clue_explanations')
      .where({
        puzzle_id: puzzleId,
        clue_number: clueNumber,
        direction: direction,
      })
      .first()

    if (!row) {
      return null
    }

    const data = JSON.parse(row.explanation_json)

    return normalizeForClient(data)
  }

  /**
   * Save an explanation to the database
   * Validates the explanation before saving to ensure schema conformance
   */
  static async saveExplanation(
    puzzleId: number,
    clueNumber: number,
    direction: string,
    clueText: string,
    answer: string,
    explanation: StoredClueExplanation | FlatClueExplanation,
  ): Promise<void> {
    const explanationToStore = extractInnerExplanationForStorage(explanation)

    // Validate the explanation before saving
    try {
      assertValidExplanation(explanationToStore)
    } catch (error) {
      console.error(
        `❌ Validation failed for puzzle ${puzzleId}, clue ${clueNumber} (${direction}):`,
      )
      console.error(`   Clue: "${clueText}"`)  
      console.error(`   Answer: ${answer}`)
      console.error(`   ${error}`)
      throw error // Re-throw to prevent saving invalid data
    }

    await db('clue_explanations')
      .insert({
        puzzle_id: puzzleId,
        clue_number: clueNumber,
        direction: direction,
        clue_text: clueText,
        answer: answer,
        explanation_json: JSON.stringify(explanationToStore),
      })
      .onConflict(['puzzle_id', 'clue_number', 'direction'])
      .merge() // Update existing record on conflict
  }

  /**
   * Get or create an explanation for a clue.
   * Returns { explanation, cached: boolean }
   */
  static async getOrCreateExplanation(
    puzzleId: number,
    clueNumber: number,
    direction: string,
    clueText: string,
    answer: string,
  ): Promise<{ explanation: FlatClueExplanation; cached: boolean }> {
    // Check cache first
    const cached = await this.getCachedExplanation(puzzleId, clueNumber, direction)
    if (cached) {
      return { explanation: cached, cached: true }
    }

    // Generate new explanation from OpenAI
    const explanation = (await explainCrypticClue({
      clue: clueText,
      answer: answer,
      mode: 'full',
    })) as StoredClueExplanation

    // Save to cache
    await this.saveExplanation(puzzleId, clueNumber, direction, clueText, answer, explanation)

    return { explanation: normalizeForClient(explanation), cached: false }
  }
}
