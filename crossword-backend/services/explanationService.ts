import db from '../db-knex'
import { explainCrypticClue } from '../utils/openrouter'

// NEW FORMAT: Top-level structure with clue_type
export interface ClueExplanation {
  clue_type: 'wordplay' | 'double_definition' | '&lit' | 'cryptic_definition'
  explanation:
    | WordplayExplanation
    | DoubleDefinitionExplanation
    | AndLitExplanation
    | CrypticDefinitionExplanation
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

export class ExplanationService {
  /**
   * Get an existing explanation from the cache
   */
  static async getCachedExplanation(
    puzzleId: number,
    clueNumber: number,
    direction: string,
  ): Promise<ClueExplanation | null> {
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

    // Handle old format (backward compatibility)
    // If data doesn't have clue_type at top level, it's in the old format
    if (!data.clue_type || !data.explanation) {
      // Wrap old format in new structure (default to 'wordplay')
      return {
        clue_type: 'wordplay',
        explanation: {
          clue_type: 'wordplay',
          ...data,
        },
      } as ClueExplanation
    }

    return data as ClueExplanation
  }

  /**
   * Save an explanation to the database
   */
  static async saveExplanation(
    puzzleId: number,
    clueNumber: number,
    direction: string,
    clueText: string,
    answer: string,
    explanation: ClueExplanation,
  ): Promise<void> {
    await db('clue_explanations')
      .insert({
        puzzle_id: puzzleId,
        clue_number: clueNumber,
        direction: direction,
        clue_text: clueText,
        answer: answer,
        explanation_json: JSON.stringify(explanation),
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
  ): Promise<{ explanation: ClueExplanation; cached: boolean }> {
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
    })) as ClueExplanation

    // Save to cache
    await this.saveExplanation(puzzleId, clueNumber, direction, clueText, answer, explanation)

    return { explanation, cached: false }
  }
}
