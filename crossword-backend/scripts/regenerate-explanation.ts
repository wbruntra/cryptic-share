import db from '../db-knex'
import { regenerateCrypticClueExplanation } from '../utils/openai'
import { ExplanationService } from '../services/explanationService'
import inquirer from 'inquirer'

interface ReportRow {
  id: number
  puzzle_id: number
  clue_number: number
  direction: string
  feedback: string
  reported_at: string
}

interface ClueRow {
  puzzle_id: number
  clue_number: number
  direction: string
  clue_text: string
  answer: string
  explanation_json: string
}

async function main() {
  console.log('🔍 Fetching pending explanation reports...')

  const reports = await db('explanation_reports')
    .join('clue_explanations', function () {
      this.on('explanation_reports.puzzle_id', '=', 'clue_explanations.puzzle_id')
        .andOn('explanation_reports.clue_number', '=', 'clue_explanations.clue_number')
        .andOn('explanation_reports.direction', '=', 'clue_explanations.direction')
    })
    .where('explanation_reports.explanation_updated', 0)
    .select('explanation_reports.*', 'clue_explanations.answer', 'clue_explanations.clue_text')
    .orderBy('explanation_reports.reported_at', 'desc')

  if (reports.length === 0) {
    console.log('✅ No pending reports found.')
    process.exit(0)
  }

  // Display summary of reports
  console.log('\n📋 Pending Reports Summary:\n')
  reports.forEach((r) => {
    console.log(`[#${r.id}] Puzzle ${r.puzzle_id}, Clue ${r.clue_number} ${r.direction}`)
    console.log(`Clue: ${r.clue_text}`)
    console.log(`Answer: ${r.answer}`)
    console.log(`Feedback: ${r.feedback}`)
    console.log('-'.repeat(50))
  })
  console.log('') // Empty line for spacing

  const choices = reports.map((r: any) => ({
    name: `[#${r.id}] Puzzle ${r.puzzle_id} | ${r.clue_number} ${
      r.direction
    } | "${r.feedback.substring(0, 50)}${r.feedback.length > 50 ? '...' : ''}"`,
    value: r.id,
  }))

  let reportData: ReportRow | undefined

  if (process.env.REPORT_ID) {
    const id = parseInt(process.env.REPORT_ID)
    reportData = reports.find((r: any) => r.id === id) as ReportRow
    if (!reportData) {
      console.error(`❌ Report ID ${id} not found in pending reports.`)
      process.exit(1)
    }
  } else {
    const { reportId } = await inquirer.prompt([
      {
        type: 'list',
        name: 'reportId',
        message: 'Select a report to handle:',
        choices,
      },
    ])
    reportData = reports.find((r: any) => String(r.id) === String(reportId)) as ReportRow
  }

  if (!reportData) {
    console.log('[DEBUG] No report data, exiting')
    return
  }

  const report = reportData

  console.log(`\n📋 Processing Report #${report.id}`)
  console.log(`Feedback: "${report.feedback}"`)

  // Fetch current explanation and clue details
  const clueData = await db<ClueRow>('clue_explanations')
    .where({
      puzzle_id: report.puzzle_id,
      clue_number: report.clue_number,
      direction: report.direction,
    })
    .first()

  if (!clueData) {
    console.error('❌ Could not find original clue explanation record.')
    process.exit(1)
  }

  console.log(`Clue: ${clueData.clue_text}`)
  console.log(`Answer: ${clueData.answer}`)

  const currentExplanation = JSON.parse(clueData.explanation_json)

  console.log('\n🔄 Regenerating explanation with OpenAI...')

  try {
    const newExplanation = await regenerateCrypticClueExplanation({
      clue: clueData.clue_text,
      answer: clueData.answer,
      feedback: report.feedback,
      previousExplanation: currentExplanation,
    })

    console.log('\n✨ New Explanation Generated:')
    console.log(JSON.stringify(newExplanation, null, 2))

    let confirmSave = false

    if (process.env.AUTO_SAVE === 'true') {
      confirmSave = true
    } else {
      const response = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirmSave',
          message: 'Do you want to save this new explanation?',
          default: true,
        },
      ])
      confirmSave = response.confirmSave
    }

    if (confirmSave) {
      // Extract the inner explanation to avoid nested structure
      const explanationToSave = newExplanation.explanation || newExplanation

      // Save directly to database, bypassing ExplanationService validation
      await db('clue_explanations')
        .insert({
          puzzle_id: report.puzzle_id,
          clue_number: report.clue_number,
          direction: report.direction,
          clue_text: clueData.clue_text,
          answer: clueData.answer,
          explanation_json: JSON.stringify(explanationToSave),
        })
        .onConflict(['puzzle_id', 'clue_number', 'direction'])
        .merge()

      const updatedCount = await db('explanation_reports')
        .where({
          puzzle_id: report.puzzle_id,
          clue_number: report.clue_number,
          direction: report.direction,
          explanation_updated: 0,
        })
        .update({ explanation_updated: 1 })

      console.log(`✅ Explanation saved. Marked ${updatedCount} report(s) as resolved.`)
    } else {
      console.log('❌ Save cancelled.')
    }
  } catch (error) {
    console.error('❌ Error regenerating explanation:', error)
  }

  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
