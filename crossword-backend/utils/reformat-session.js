const sessionState =
  '[["H","","P","","E","","S","","","","P","","","",""],["O","","O","","R","","T","","","","R","","","",""],["L","U","L","L","A","B","Y","","","","O","","","",""],["Y","","I","","","","L","","","","O","","","",""],["S","I","C","","T","H","E","N","C","E","F","O","R","T","H"],["E","","E","","H","","","","","","","","","",""],["E","M","C","E","E","","M","A","I","L","O","R","D","E","R"],["","","O","","R","","E","","","","C","","","",""],["V","E","N","G","E","A","N","C","E","","E","X","C","E","L"],["I","","S","","","","A","","","","A","","","","I"],["S","I","T","T","I","N","G","D","O","W","N","","O","W","N"],["I","","A","","C","","E","","M","","","","","","O"],["T","U","B","B","I","E","R","","E","L","E","G","I","A","C"],["S","","L","","N","","I","","G","","T","","","","U"],["","L","E","A","G","U","E","","A","","A","","","","T"]]'

export const formatAsString = (sessionState) => {
  const parsed = JSON.parse(sessionState)
  let result = []
  let nextChar = ''

  for (let i = 0; i < parsed.length; i++) {
    let line = ''
    for (let j = 0; j < parsed[i].length; j++) {
      nextChar = parsed[i][j]
      if (nextChar === '') {
        nextChar = ' '
      }
      line += nextChar
    }
    result.push(line)
  }

  return result
}

console.log(formatAsString(sessionState))
