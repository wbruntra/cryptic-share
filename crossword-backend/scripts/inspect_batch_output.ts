import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

async function main() {
  const fileId = 'file-5VMQEzUPRrs7JjSWyex6mt'
  console.log(`Downloading output file: ${fileId}`)
  try {
    const fileResponse = await openai.files.content(fileId)
    const content = await fileResponse.text()
    console.log('Output File Content:')
    console.log(content)
  } catch (e) {
    console.error('Error retrieving file:', e)
  }
}

main()
