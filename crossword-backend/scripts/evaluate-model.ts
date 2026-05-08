/**
 * evaluate-model.ts
 *
 * Tests a candidate model's explanation quality against reference explanations
 * stored in the database for a given puzzle.
 *
 * Usage:
 *   bun scripts/evaluate-model.ts --puzzle-id 3 [--clue-number 5] [--direction across] \
 *     [--model deepseek/deepseek-v4-flash] [--judge deepseek/deepseek-r1]
 *
 * Defaults:
 *   --model    deepseek/deepseek-v4-flash
 *   --judge    deepseek/deepseek-prover-v2
 */

import { db } from '../db'
import { explainCrypticClue } from '../utils/openrouter'
import { OpenRouter } from '@openrouter/sdk'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ClueExplanationRow {
  id: number
  puzzle_id: number
  clue_number: number
  direction: string
  clue_text: string
  answer: string
  explanation_json: string
}

interface JudgeScore {
  clue_type_match: boolean
  structural_accuracy: number   // 1–5
  letter_accounting: number     // 1–5 (N/A returns 5 for non-wordplay)
  explanation_quality: number   // 1–5
  overall_score: number         // 1–10
  verdict: 'correct' | 'mostly_correct' | 'partially_correct' | 'incorrect'
  issues: string[]
  reasoning: string
}

interface ClueResult {
  clue_number: number
  direction: string
  clue_text: string
  answer: string
  reference_explanation: any
  candidate_explanation: any
  score: JudgeScore
  candidate_error?: string
  judge_error?: string
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DEFAULT_TEST_MODEL = 'deepseek/deepseek-v4-flash'
const DEFAULT_JUDGE_MODEL = 'deepseek/deepseek-v4-pro'

const client = new OpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2)
  const get = (flag: string) => {
    const i = args.indexOf(flag)
    return i !== -1 ? args[i + 1] : undefined
  }
  const puzzleIdRaw = get('--puzzle-id')
  if (!puzzleIdRaw) {
    console.error('Error: --puzzle-id is required')
    process.exit(1)
  }
  return {
    puzzleId: parseInt(puzzleIdRaw, 10),
    clueNumber: get('--clue-number') ? parseInt(get('--clue-number')!, 10) : undefined,
    direction: get('--direction') as 'across' | 'down' | undefined,
    testModel: get('--model') ?? DEFAULT_TEST_MODEL,
    judgeModel: get('--judge') ?? DEFAULT_JUDGE_MODEL,
  }
}

// ---------------------------------------------------------------------------
// Judge prompt and schema
// ---------------------------------------------------------------------------

const judgeInstructions = `
You are an expert cryptic crossword judge evaluating two explanations for the same clue.

You will be given:
- The clue text and correct answer
- A REFERENCE explanation (known to be correct)
- A CANDIDATE explanation (to be scored)

Your task: evaluate how well the candidate explanation matches the reference, focusing on:
1. clue_type_match: Does the candidate identify the same clue type (wordplay, double_definition, &lit, cryptic_definition, no_clean_parse)?
2. structural_accuracy (1–5): Does the candidate correctly parse the clue structure (definition location, wordplay mechanism)?
3. letter_accounting (1–5): For wordplay/&lit clues, does the candidate correctly account for every letter? Score 5 if the clue type does not require letter accounting.
4. explanation_quality (1–5): Is the candidate's full_explanation clear, accurate, and appropriately concise?
5. overall_score (1–10): Holistic score. A 10 means the candidate is as good as or better than the reference. A 1 means completely wrong.
6. verdict: One of 'correct', 'mostly_correct', 'partially_correct', 'incorrect'.
   - correct: Matches reference in all key respects.
   - mostly_correct: Right clue type and mechanism, minor differences in wording/detail.
   - partially_correct: Right clue type but flawed parsing or letter accounting.
   - incorrect: Wrong clue type or fundamentally wrong parse.
7. issues: Specific problems found in the candidate (empty array if none).
8. reasoning: One paragraph explaining your evaluation.

Be precise. Score strictly — a correct clue_type with wrong letter accounting should not score above 6 overall.
`.trim()

const judgeSchema = {
  name: 'evaluation_score',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      clue_type_match: {
        type: 'boolean',
        description: 'Whether the candidate identified the same clue type as the reference',
      },
      structural_accuracy: {
        type: 'number',
        description: 'Score 1–5 for correctness of clue structure parsing',
      },
      letter_accounting: {
        type: 'number',
        description: 'Score 1–5 for letter accounting accuracy (5 if N/A for this clue type)',
      },
      explanation_quality: {
        type: 'number',
        description: 'Score 1–5 for clarity and accuracy of the full_explanation field',
      },
      overall_score: {
        type: 'number',
        description: 'Holistic score 1–10',
      },
      verdict: {
        type: 'string',
        enum: ['correct', 'mostly_correct', 'partially_correct', 'incorrect'],
      },
      issues: {
        type: 'array',
        items: { type: 'string' },
        description: 'List of specific problems in the candidate explanation',
      },
      reasoning: {
        type: 'string',
        description: 'One paragraph explaining the evaluation',
      },
    },
    required: [
      'clue_type_match',
      'structural_accuracy',
      'letter_accounting',
      'explanation_quality',
      'overall_score',
      'verdict',
      'issues',
      'reasoning',
    ],
    additionalProperties: false,
  },
}

async function judgeExplanation(
  clue: string,
  answer: string,
  reference: any,
  candidate: any,
  judgeModel: string,
): Promise<JudgeScore> {
  const userContent = `
Clue: ${clue}
Answer: ${answer}

REFERENCE explanation:
${JSON.stringify(reference, null, 2)}

CANDIDATE explanation:
${JSON.stringify(candidate, null, 2)}
`.trim()

  const result = await client.chat.send({
    chatRequest: {
      model: judgeModel,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: judgeInstructions },
            { type: 'text', text: userContent },
          ],
        },
      ],
      responseFormat: {
        type: 'json_schema',
        jsonSchema: judgeSchema,
      },
      plugins: [{ id: 'response-healing' }],
      stream: false,
    },
  })

  const content = result?.choices[0]?.message.content
  if (!content || typeof content !== 'string') {
    throw new Error('No content from judge model')
  }
  return JSON.parse(content) as JudgeScore
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

function verdictColor(verdict: string): string {
  switch (verdict) {
    case 'correct': return '\x1b[32m' // green
    case 'mostly_correct': return '\x1b[33m' // yellow
    case 'partially_correct': return '\x1b[35m' // magenta
    case 'incorrect': return '\x1b[31m' // red
    default: return '\x1b[0m'
  }
}
const RESET = '\x1b[0m'
const BOLD = '\x1b[1m'
const DIM = '\x1b[2m'

function printResult(r: ClueResult, index: number) {
  const bar = '─'.repeat(60)
  console.log(`\n${bar}`)
  console.log(`${BOLD}[${index + 1}] ${r.clue_number} ${r.direction.toUpperCase()}${RESET}`)
  console.log(`${DIM}Clue:   ${r.clue_text}${RESET}`)
  console.log(`${DIM}Answer: ${r.answer}${RESET}`)

  if (r.candidate_error) {
    console.log(`\n\x1b[31mCandidate model ERROR: ${r.candidate_error}${RESET}`)
    return
  }

  if (r.judge_error) {
    console.log(`\n\x1b[31mJudge ERROR: ${r.judge_error}${RESET}`)
    console.log('Candidate response:')
    console.log(JSON.stringify(r.candidate_explanation, null, 2))
    return
  }

  const s = r.score
  const vc = verdictColor(s.verdict)
  console.log(`\nVerdict:  ${vc}${BOLD}${s.verdict.toUpperCase()}${RESET}  (overall: ${BOLD}${s.overall_score}/10${RESET})`)
  console.log(`Scores:   type_match=${s.clue_type_match ? '✓' : '✗'}  structure=${s.structural_accuracy}/5  letters=${s.letter_accounting}/5  explanation=${s.explanation_quality}/5`)
  if (s.issues.length > 0) {
    console.log(`Issues:`)
    s.issues.forEach((issue) => console.log(`  • ${issue}`))
  }
  console.log(`\nReasoning: ${DIM}${s.reasoning}${RESET}`)

  console.log(`\n${DIM}Reference clue_type: ${r.reference_explanation.clue_type ?? r.reference_explanation.explanation?.clue_type}${RESET}`)
  console.log(`${DIM}Candidate clue_type: ${r.candidate_explanation.clue_type ?? r.candidate_explanation.explanation?.clue_type}${RESET}`)
}

function printSummary(results: ClueResult[], testModel: string, judgeModel: string) {
  const successful = results.filter((r) => !r.candidate_error && !r.judge_error)
  const errored = results.filter((r) => r.candidate_error || r.judge_error)

  console.log('\n' + '═'.repeat(60))
  console.log(`${BOLD}SUMMARY${RESET}`)
  console.log(`Test model:  ${testModel}`)
  console.log(`Judge model: ${judgeModel}`)
  console.log(`Clues tested: ${results.length} (${errored.length} errors)`)

  if (successful.length === 0) return

  const avgOverall = successful.reduce((s, r) => s + r.score.overall_score, 0) / successful.length
  const avgStructure = successful.reduce((s, r) => s + r.score.structural_accuracy, 0) / successful.length
  const avgLetters = successful.reduce((s, r) => s + r.score.letter_accounting, 0) / successful.length
  const avgExplain = successful.reduce((s, r) => s + r.score.explanation_quality, 0) / successful.length
  const typeMatchPct = (successful.filter((r) => r.score.clue_type_match).length / successful.length) * 100

  console.log(`\nAverages (${successful.length} evaluated):`)
  console.log(`  Overall score:        ${avgOverall.toFixed(1)}/10`)
  console.log(`  Structure accuracy:   ${avgStructure.toFixed(1)}/5`)
  console.log(`  Letter accounting:    ${avgLetters.toFixed(1)}/5`)
  console.log(`  Explanation quality:  ${avgExplain.toFixed(1)}/5`)
  console.log(`  Clue type match:      ${typeMatchPct.toFixed(0)}%`)

  const verdictCounts: Record<string, number> = {}
  successful.forEach((r) => {
    verdictCounts[r.score.verdict] = (verdictCounts[r.score.verdict] ?? 0) + 1
  })
  console.log(`\nVerdicts:`)
  for (const [v, n] of Object.entries(verdictCounts)) {
    const vc = verdictColor(v)
    console.log(`  ${vc}${v}${RESET}: ${n}`)
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const { puzzleId, clueNumber, direction, testModel, judgeModel } = parseArgs()

  console.log(`${BOLD}Evaluating puzzle ${puzzleId}${RESET}`)
  console.log(`Test model:  ${testModel}`)
  console.log(`Judge model: ${judgeModel}`)
  if (clueNumber) console.log(`Clue filter: ${clueNumber} ${direction ?? '(both directions)'}`)

  // Fetch stored explanations
  let rows = db
    .prepare(
      `SELECT * FROM clue_explanations WHERE puzzle_id = ? ORDER BY clue_number, direction`,
    )
    .all(puzzleId) as ClueExplanationRow[]

  if (clueNumber !== undefined) {
    rows = rows.filter((r) => {
      if (r.clue_number !== clueNumber) return false
      if (direction && r.direction !== direction) return false
      return true
    })
  }

  if (rows.length === 0) {
    console.error(`No stored explanations found for puzzle ${puzzleId}`)
    process.exit(1)
  }

  console.log(`\nFound ${rows.length} stored explanation(s) to evaluate.\n`)

  const results: ClueResult[] = []
  let i = 0

  for (const row of rows) {
    const reference = JSON.parse(row.explanation_json)

    process.stdout.write(
      `[${++i}/${rows.length}] ${row.clue_number} ${row.direction} — generating candidate... `,
    )

    let candidateExplanation: any = null
    let candidateError: string | undefined

    try {
      candidateExplanation = await explainCrypticClue({
        clue: row.clue_text,
        answer: row.answer,
        model: testModel,
      })
      process.stdout.write('done. Judging... ')
    } catch (err: any) {
      candidateError = err?.message ?? String(err)
      process.stdout.write(`ERROR\n`)
    }

    let score: JudgeScore | undefined
    let judgeError: string | undefined

    if (!candidateError) {
      try {
        score = await judgeExplanation(
          row.clue_text,
          row.answer,
          reference,
          candidateExplanation,
          judgeModel,
        )
        process.stdout.write('done.\n')
      } catch (err: any) {
        judgeError = err?.message ?? String(err)
        process.stdout.write(`JUDGE ERROR\n`)
      }
    }

    results.push({
      clue_number: row.clue_number,
      direction: row.direction,
      clue_text: row.clue_text,
      answer: row.answer,
      reference_explanation: reference,
      candidate_explanation: candidateExplanation,
      score: score!,
      candidate_error: candidateError,
      judge_error: judgeError,
    })
  }

  // Print detailed results
  results.forEach((r, i) => printResult(r, i))

  // Print summary
  printSummary(results, testModel, judgeModel)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
