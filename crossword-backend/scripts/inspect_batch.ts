import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

async function main() {
  const batchId = 'batch_696f0067a09c8190845ab94f38587278'
  console.log(`Inspecting batch: ${batchId}`)
  try {
    const batch = await openai.batches.retrieve(batchId)
    console.log(JSON.stringify(batch, null, 2))

    if (batch.error_file_id) {
      console.log(`Downloading error file: ${batch.error_file_id}`)
      const fileResponse = await openai.files.content(batch.error_file_id)
      const content = await fileResponse.text()
      console.log('Error File Content:')
      console.log(content)
    }
  } catch (e) {
    console.error('Error retrieving batch:', e)
  }
}

main()
