import db from '../db-knex'

// Users to attribute to
const users = [
  { id: 1, username: 'bruntrager' },
  { id: 2, username: 'bill' }
]

type CellType = 'N' | 'W' | 'B'

interface ClueMetadata {
  number: number
  direction: 'across' | 'down'
  row: number
  col: number
}

function extractClueMetadata(grid: CellType[][]): ClueMetadata[] {
  const metadata: ClueMetadata[] = []
  let currentNumber = 1

  for (let r = 0; r < grid.length; r++) {
    const row = grid[r]
    if (!row) continue
    
    for (let c = 0; c < row.length; c++) {
      if (row[c] === 'B') continue

      const isStartAcross =
        c === 0 || row[c - 1] === 'B'
          ? c < row.length - 1 && row[c + 1] !== 'B'
          : false

      const isStartDown =
        r === 0 || grid[r - 1]?.[c] === 'B'
          ? r < grid.length - 1 && grid[r + 1]?.[c] !== 'B'
          : false

      if (isStartAcross || isStartDown) {
        if (isStartAcross) {
          metadata.push({ number: currentNumber, direction: 'across', row: r, col: c })
        }
        if (isStartDown) {
          metadata.push({ number: currentNumber, direction: 'down', row: r, col: c })
        }
        currentNumber++
      }
    }
  }

  return metadata
}

function isWordComplete(
  grid: CellType[][],
  state: string[],
  clue: ClueMetadata
): boolean {
  let r = clue.row
  let c = clue.col

  while (r < grid.length && c < (grid[0]?.length || 0) && grid[r]?.[c] !== 'B') {
    const cellValue = state[r]?.[c] || ' '
    if (cellValue === ' ' || cellValue === '') {
      return false
    }
    if (clue.direction === 'across') c++
    else r++
  }

  return true
}

async function main() {
  console.log('🔍 Finding sessions with filled answers...')

  // Get all sessions with state
  const sessions = await db('puzzle_sessions')
    .select('session_id', 'puzzle_id', 'state', 'user_id')
    .whereNotNull('state')
    .whereNot('state', '[]')

  console.log(`Found ${sessions.length} sessions to process\n`)

  for (const session of sessions) {
    const state = JSON.parse(session.state) as string[]
    
    // Skip empty states
    if (!state || state.length === 0 || state.every(row => !row || row.trim() === '')) {
      continue
    }

    // Get puzzle grid
    const puzzle = await db('puzzles')
      .select('id', 'title', 'grid')
      .where('id', session.puzzle_id)
      .first()

    if (!puzzle) continue

    // Parse grid
    const gridLines = puzzle.grid.split('\n')
    const grid = gridLines.map((line: string) => line.trim().split(' ') as CellType[])

    // Extract clue metadata
    const clueMetadata = extractClueMetadata(grid)

    // Find complete words
    const completeWords: ClueMetadata[] = []
    for (const clue of clueMetadata) {
      if (isWordComplete(grid, state, clue)) {
        completeWords.push(clue)
      }
    }

    if (completeWords.length === 0) {
      console.log(`⏭️  Session ${session.session_id} (${puzzle.title}): No complete words`)
      continue
    }

    // Randomly attribute complete words
    const attributions: Record<string, { userId: number; username: string; timestamp: string }> = {}
    
    for (const clue of completeWords) {
      const randomUser = users[Math.floor(Math.random() * users.length)]
      if (!randomUser) continue
      
      const clueKey = `${clue.number}-${clue.direction}`
      attributions[clueKey] = {
        userId: randomUser.id,
        username: randomUser.username,
        timestamp: new Date().toISOString()
      }
    }

    // Update session with attributions
    await db('puzzle_sessions')
      .where('session_id', session.session_id)
      .update({
        attributions: JSON.stringify(attributions)
      })

    console.log(`✅ Session ${session.session_id} (${puzzle.title}): Attributed ${completeWords.length} words`)
    
    // Show distribution
    const bruntragerCount = Object.values(attributions).filter(a => a.username === 'bruntrager').length
    const billCount = Object.values(attributions).filter(a => a.username === 'bill').length
    console.log(`   - bruntrager: ${bruntragerCount} words`)
    console.log(`   - bill: ${billCount} words`)
    console.log()
  }

  console.log('✨ Done!')
  process.exit(0)
}

main().catch((error) => {
  console.error('Error:', error)
  process.exit(1)
})
