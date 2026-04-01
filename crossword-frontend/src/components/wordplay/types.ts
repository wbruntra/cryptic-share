/**
 * Strict schema for wordplay visualization.
 *
 * The visualization renders as a vertical sequence of "stages", where each
 * stage is one row showing the clue in its current state of manipulation.
 * Wordplay tokens progressively get "consumed" into uppercase letter boxes.
 *
 * Stage sequence for "Cold is on the way back, exactly as it was written" → SIC:
 *   [0] Cold  is  on the way back,  exactly as it was written
 *   [1] [C]   is  on the way back,  exactly as it was written   ← Cold → abbreviate → C
 *   [2] [CIS]     on the way back,  exactly as it was written   ← C + is → join → CIS
 *   [3] [CIS] [on the way back,↗]   exactly as it was written   ← reversal indicator
 *   [4] [SIC] = exactly as it was written                       ← answer matches definition
 */

export type OperationType =
  | 'take'        // take the letters as written
  | 'abbreviate'  // standard abbreviation (Cold → C, Doctor → DR)
  | 'initial'     // first letter(s) of word(s)
  | 'reverse'     // reverse the string
  | 'anagram'     // rearrange letters
  | 'container'   // insert one string inside another
  | 'hidden'      // letters hidden within a run of text
  | 'homophone'   // sounds like
  | 'join'        // concatenate (charade)

export type TokenRole = 'definition' | 'wordplay' | 'indicator' | 'link'

/** A single word or phrase from the original clue */
export interface ClueToken {
  id: string
  text: string
  role: TokenRole
}

/** One segment within a stage row */
export type Segment =
  | {
      kind: 'text'
      /** ID of the ClueToken this segment represents (unconsumed, shown as plain text) */
      tokenId: string
    }
  | {
      kind: 'letters'
      /** The current letter string in this box (always shown uppercase) */
      letters: string
    }
  | {
      kind: 'indicator'
      /** ID of the ClueToken that acts as the indicator */
      tokenId: string
      /** Short label shown in a tooltip, e.g. "indicator for reversal" */
      tooltip: string
    }
  | {
      kind: 'definition'
      /** IDs of the ClueTokens making up the definition */
      tokenIds: string[]
    }

/** One row in the vertical visualization */
export interface Stage {
  id: string
  segments: Segment[]
  /** Short label shown to the right explaining what happened at this stage */
  annotation?: string
}

/** The full visualization data for one cryptic clue explanation */
export interface WordplayVisualization {
  clue: string
  answer: string
  /** All tokens of the clue in order */
  tokens: ClueToken[]
  /**
   * Ordered stages. The first stage must be all `text` segments (raw clue).
   * The last stage must end with a `definition` segment (the "equation" row).
   */
  stages: Stage[]
}
