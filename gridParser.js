// crossword.js
const gridData = `
N W N W N W N B N W N W N W B
W B W B W B W B W B W B W B N
N W W W W W W B N W W W W W W
W B W B B B W B W B W B W B W
N W W B N W W W W W W W W W W
W B W B N B B B W B B B W B W
N W W W W B N W W W W N W W W
B B W B N B W B W B N B W B B
N W W W W W W W W B N W W W N
W B W B B B W B B B N B W B W
N W W W N W W W W N W B N W W
W B W B W B W B W B B B W B W
N W W W W W W B N W N W W W W
W B W B W B B B W B W B W B W
B N W W W W W B N W W W W W W
`
  .trim()
  .split('\n')
  .map((row) => row.trim().split(' '))

function renderGrid(grid) {
  const height = grid.length
  const width = grid[0].length
  let currentNumber = 1

  console.log('+' + '---+'.repeat(width))

  for (let r = 0; r < height; r++) {
    let rowDisplay = '|'
    for (let c = 0; c < width; c++) {
      const cell = grid[r][c]
      if (cell === 'B') {
        rowDisplay += '###|' // Black square
      } else if (cell === 'N') {
        // Pad the number to keep the grid aligned
        const numStr = currentNumber.toString().padEnd(2, ' ')
        rowDisplay += `${numStr} |`
        currentNumber++
      } else {
        rowDisplay += '   |' // White square
      }
    }
    console.log(rowDisplay)
    console.log('+' + '---+'.repeat(width))
  }
}

renderGrid(gridData)
