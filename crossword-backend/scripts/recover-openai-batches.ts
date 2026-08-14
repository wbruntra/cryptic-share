/**
 * Recover OpenAI batch records that exist on OpenAI but are missing from the local DB.
 *
 * Usage:
 *   bun scripts/recover-openai-batches.ts           # dry-run, show what would be recovered
 *   bun scripts/recover-openai-batches.ts --apply    # actually insert missing records
 *
 * After recovering, run: bun scripts/batch-explanation-auto.ts apply
 */

import OpenAI from 'openai'
import minimist from 'minimist'
import db from '../db-knex'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

async function main() {
  const argv = minimist(Bun.argv.slice(2), { boolean: ['apply', 'help'], alias: { h: 'help' } })

  if (argv.help) {
    console.log('Usage: bun scripts/recover-openai-batches.ts [--apply]\n')
    console.log('  Default: dry-run, shows batches that would be recovered')
    console.log('  --apply: insert missing batch records into local DB')
    return
  }

  const doApply = argv.apply

  // Get all local batch IDs
  const localRows = await db('explanation_batches').select('batch_id')
  const localIds = new Set(localRows.map((r: any) => r.batch_id))

  console.log(`Local DB has ${localIds.size} batch records\n`)

  // Paginate through all OpenAI batches
  console.log('Fetching OpenAI batches...')
  let found = 0
  let recovered = 0
  const toRecover: Array<{
    batch_id: string
    puzzle_id: number
    status: string
    input_file_id: string
    output_file_id: string | null
    created_at: number
  }> = []

  let after: string | undefined
  let page = 0
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000 // 30 days

  while (true) {
    page++
    const params: any = { limit: 100 }
    if (after) params.after = after
    const list = await openai.batches.list(params)

    for (const batch of list.data) {
      found++

      // Skip very old batches
      if (batch.created_at * 1000 < cutoff) continue

      if (localIds.has(batch.id)) continue

      // Download input file to extract puzzle_id
      let puzzleId: number | null = null
      try {
        const content = await openai.files.content(batch.input_file_id)
        const text = await content.text()
        const firstLine = text.trim().split('\n')[0]
        if (firstLine) {
          const parsed = JSON.parse(firstLine)
          const match = parsed.custom_id?.match(/^p(\d+)_/)
          if (match) puzzleId = parseInt(match[1], 10)
        }
      } catch {
        // Can't determine puzzle, skip
        continue
      }

      if (puzzleId === null) continue

      // Get puzzle info
      const puzzle = await db('puzzles').select('title', 'puzzle_number').where('id', puzzleId).first()

      toRecover.push({
        batch_id: batch.id,
        puzzle_id: puzzleId,
        status: batch.status,
        input_file_id: batch.input_file_id,
        output_file_id: batch.output_file_id || null,
        created_at: batch.created_at,
      })

      const created = new Date(batch.created_at * 1000).toLocaleString()
      const statusIcon = batch.status === 'completed' ? '✅' : batch.status === 'failed' ? '❌' : '🔄'
      console.log(
        `  ${statusIcon} ${batch.id}  P#${puzzle?.puzzle_number ?? '?'} "${puzzle?.title ?? '?'}"  ${batch.status}  ${created}`,
      )

      recovered++
    }

    if (!list.has_more) break
    after = list.data[list.data.length - 1]?.id
  }

  console.log(`\nScanned ${found} OpenAI batches, found ${recovered} missing from local DB`)

  if (recovered === 0) {
    console.log('Nothing to recover.')
    await db.destroy()
    return
  }

  if (!doApply) {
    console.log('\n(Dry run — use --apply to insert these records)')
    await db.destroy()
    return
  }

  // Insert
  console.log('\nInserting records...')
  for (const r of toRecover) {
    const existing = await db('explanation_batches').where('batch_id', r.batch_id).first()
    if (existing) continue

    const createdAt = new Date(r.created_at * 1000).toISOString().replace('T', ' ').replace('Z', '')
    await db('explanation_batches').insert({
      batch_id: r.batch_id,
      puzzle_id: r.puzzle_id,
      status: r.status,
      input_file_id: r.input_file_id,
      output_file_id: r.output_file_id || null,
      created_at: createdAt,
      updated_at: createdAt,
    })
    console.log(`  ✓ ${r.batch_id}`)
  }

  console.log(`\nRecovered ${toRecover.length} batch record(s).`)
  console.log('Now run: bun scripts/batch-explanation-auto.ts apply')

  await db.destroy()
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
