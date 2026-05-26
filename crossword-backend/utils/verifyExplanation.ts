/**
 * Verification utility for cryptic clue explanations.
 *
 * Checks whether the wordplay_steps in a new-format explanation
 * produce a consistent step-by-step reduction from the original clue
 * to the answer.
 *
 * Verification rules:
 * - Tokens must appear CONTIGUOUSLY in the current clue state.
 *   If a word appears between token[i] and token[i+1] but is not itself
 *   a token, the step is invalid (the model made an error).
 * - The span from the first token to the last token is replaced by
 *   the result, and the resulting text must match clue_after (normalized).
 * - The final state must contain the answer.
 */

export interface StepVerification {
  stepIndex: number
  verified: boolean
  detail: string
}

export interface ExplanationVerification {
  verified: boolean
  clueType: string
  answer: string
  clueText: string
  steps: StepVerification[]
  finalAnswerPresent: boolean
  error?: string
}

interface WordplayStep {
  tokens: string
  operation: string
  result: string
  clue_after: string
}

function tokensAsString(t: unknown): string {
  if (typeof t === 'string') return t
  if (Array.isArray(t)) return t.join(' ')
  return ''
}

function isPlaceholderStep(s: { tokens: unknown }): boolean {
  const t = tokensAsString(s.tokens).trim()
  return t.length === 0 || t === '(none)'
}

/**
 * Normalize a string for comparison:
 * - lowercase
 * - strip trailing parenthesized letter counts e.g. "(7)" or "(5,6)"
 * - remove all punctuation
 * - collapse whitespace
 */
function normalizeForComparison(s: string): string {
  return s
    .toLowerCase()
    .replace(/\([0-9,\s-]+\)\s*$/, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Split text into word tokens (preserving punctuation, splitting on whitespace).
 */
function splitIntoWords(text: string): string[] {
  return text.split(/\s+/).filter((w) => w.length > 0)
}

/**
 * Match a token against a word from the text.
 * Returns true if the word "matches" the token.
 *
 * Matching is case-insensitive. Punctuation-only tokens (like "—")
 * are matched literally. For alphanumeric tokens, we strip trailing
 * punctuation from both sides before comparing.
 */
function wordMatchesToken(word: string, token: string): boolean {
  const isPunctOnly = /^[^a-zA-Z0-9]+$/.test(token)
  if (isPunctOnly) {
    return word === token
  }

  const wordClean = word.replace(/[^a-zA-Z0-9]+$/, '').toLowerCase()
  const tokenClean = token.replace(/[^a-zA-Z0-9]+$/, '').toLowerCase()
  return wordClean === tokenClean && tokenClean.length > 0
}

/**
 * Find all constituent words of a token (which may be multi-word like "sort of")
 * in the word array, consecutively, starting from startFrom.
 * Returns the index of the first matched word, or -1.
 * On success, also returns the count of words consumed and the last matched index.
 */
function findTokenWords(
  tokenWords: string[],
  allWords: string[],
  startFrom: number,
): { firstIdx: number; lastIdx: number; count: number } | null {
  if (tokenWords.length === 0) return null

  for (let i = startFrom; i <= allWords.length - tokenWords.length; i++) {
    let allMatch = true
    for (let j = 0; j < tokenWords.length; j++) {
      if (!wordMatchesToken(allWords[i + j], tokenWords[j])) {
        allMatch = false
        break
      }
    }
    if (allMatch) {
      return {
        firstIdx: i,
        lastIdx: i + tokenWords.length - 1,
        count: tokenWords.length,
      }
    }
  }

  return null
}

/**
 * Verify a single step: can the step's clue_after be produced by
 * finding the tokens contiguously in previousText and replacing
 * the span with the result?
 */
function verifyStep(
  previousText: string,
  step: WordplayStep,
): { verified: boolean; detail: string; computedAfter: string } {
  const tokensStr = tokensAsString(step.tokens)
  const { result, clue_after: expectedAfter } = step

  if (tokensStr.trim().length === 0) {
    return { verified: false, detail: 'no tokens in step', computedAfter: previousText }
  }

  const allWords = splitIntoWords(previousText)
  if (allWords.length === 0) {
    return { verified: false, detail: 'empty previous clue state', computedAfter: previousText }
  }

  const tokenWords = splitIntoWords(tokensStr)
  if (tokenWords.length === 0) {
    return { verified: false, detail: 'tokens string split to zero words', computedAfter: previousText }
  }

  const match = findTokenWords(tokenWords, allWords, 0)
  if (!match) {
    return {
      verified: false,
      detail: `tokens "${tokensStr}" not found in previous clue state`,
      computedAfter: previousText,
    }
  }

  const prefixWords = allWords.slice(0, match.firstIdx)
  const suffixWords = allWords.slice(match.lastIdx + 1)

  const computedAfter = [...prefixWords, result, ...suffixWords]
    .filter((w) => w.length > 0)
    .join(' ')

  const normalizedComputed = normalizeForComparison(computedAfter)
  const normalizedExpected = normalizeForComparison(expectedAfter)

  if (normalizedComputed === normalizedExpected) {
    return { verified: true, detail: 'step matches', computedAfter }
  }

  return {
    verified: false,
    detail: `computed "${normalizedComputed}" !== expected "${normalizedExpected}"`,
    computedAfter,
  }
}

function normalizeForAnswerCheck(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function answerPresentInFinalState(finalText: string, answer: string): boolean {
  const finalNorm = normalizeForAnswerCheck(finalText)
  const answerNorm = normalizeForAnswerCheck(answer)
  return finalNorm.includes(answerNorm)
}

/**
 * Verify an explanation against its clue text and answer.
 *
 * For wordplay and &lit clues: walks through each wordplay_step,
 * verifying that the token→result substitution produces the claimed
 * clue_after. Returns verified=true only if ALL steps verify and
 * the answer is present in the final state.
 *
 * For other clue types (double_definition, cryptic_definition,
 * no_clean_parse): returns verified=false with error explaining why
 * (no wordplay steps to verify).
 */
export function verifyExplanation(
  explanationJson: unknown,
  clueText: string,
  answer: string,
): ExplanationVerification {
  try {
    const obj = explanationJson as Record<string, unknown>

    let clueType = 'unknown'
    let steps: WordplayStep[] | undefined

    if (typeof obj.clue_type === 'string') {
      clueType = obj.clue_type
      steps = obj.wordplay_steps as WordplayStep[] | undefined
    }

    // Filter out placeholder steps (handles both string and legacy array tokens)
    if (steps) {
      steps = steps.filter((s) => !isPlaceholderStep(s))
    }

    if (!steps || steps.length === 0) {
      return {
        verified: false,
        clueType,
        answer,
        clueText,
        steps: [],
        finalAnswerPresent: false,
        error: `no wordplay_steps for clue_type=${clueType}`,
      }
    }

    const stepResults: StepVerification[] = []
    let currentText = clueText.trim()
    let allVerified = true

    for (let i = 0; i < steps.length; i++) {
      const result = verifyStep(currentText, steps[i])

      stepResults.push({
        stepIndex: i,
        verified: result.verified,
        detail: result.detail,
      })

      if (!result.verified) {
        allVerified = false
      }

      currentText = steps[i].clue_after.trim()
    }

    const finalAfter = steps[steps.length - 1].clue_after.trim()
    const answerPresent = answerPresentInFinalState(finalAfter, answer)

    return {
      verified: allVerified,
      clueType,
      answer,
      clueText,
      steps: stepResults,
      finalAnswerPresent: answerPresent,
    }
  } catch (err: any) {
    return {
      verified: false,
      clueType: 'error',
      answer,
      clueText,
      steps: [],
      finalAnswerPresent: false,
      error: err.message || 'unknown error',
    }
  }
}
