import { CellType, RenderedCell, Direction } from '../types'

export function parseGridString(gridString: string): CellType[][] {
    return gridString.trim().split('\n').map(row => 
        row.trim().split(' ') as CellType[]
    )
}

export function parseGridJson(jsonString: string): CellType[][] {
    try {
        const gridArray = JSON.parse(jsonString)
        if (!Array.isArray(gridArray)) return []
        
        return gridArray.map((row: unknown) => {
            if (typeof row !== 'string') return []
            // Handle space separated or just plain string?
            // The previous code handled space separated "N W B".
            return row.trim().split(/\s+/) as CellType[]
        })
    } catch {
        return []
    }
}

interface RenderGridOptions {
    grid: CellType[][]
    answers?: string[][]
    cursor?: { r: number, c: number, direction: Direction } | null
    mode?: 'edit' | 'play' | 'view'
}

interface RenderResult {
    renderedGrid: RenderedCell[][]
    numberMap: Map<number, {r: number, c: number}>
    currentClueNumber: number | null
}

export function renderGrid({ grid, answers, cursor, mode = 'view' }: RenderGridOptions): RenderResult {
    if (grid.length === 0) {
        return { renderedGrid: [], numberMap: new Map(), currentClueNumber: null }
    }

    let currentNumber = 1
    const numberMap = new Map<number, {r: number, c: number}>()

    const renderedGrid = grid.map((row, r) => 
        row.map((cell, c) => {
            let number = null
            if (cell === 'N') {
                number = currentNumber
                numberMap.set(currentNumber, {r, c})
                currentNumber++
            }
            
            // Visuals
            const isSelected = !!(mode === 'play' && cursor?.r === r && cursor?.c === c)
            const isPlayableCell = cell !== 'B'
            
            // Active word highlighting
            let isActiveWord = false
            if (mode === 'play' && cursor && isPlayableCell) {
                if (cursor.direction === 'across' && r === cursor.r) {
                    let startC = cursor.c
                    while(startC > 0 && grid[r][startC-1] !== 'B') startC--
                    let endC = cursor.c
                    while(endC < grid[0].length - 1 && grid[r][endC+1] !== 'B') endC++
                    
                    if (c >= startC && c <= endC) isActiveWord = true

                } else if (cursor.direction === 'down' && c === cursor.c) {
                    let startR = cursor.r
                    while(startR > 0 && grid[startR-1][c] !== 'B') startR--
                    let endR = cursor.r
                    while(endR < grid.length - 1 && grid[endR+1][c] !== 'B') endR++
                    
                    if (r >= startR && r <= endR) isActiveWord = true
                }
            }

            return { 
                type: cell, 
                number, 
                isSelected,
                isActiveWord,
                answer: answers && answers[r] ? answers[r][c] : ''
            }
        })
    )

    // Find the number for the active word
    let currentClueNumber = null
    if (mode === 'play' && cursor) {
        let r = cursor.r
        let c = cursor.c
        // Backtrack
        if (cursor.direction === 'across') {
             while(c > 0 && grid[r][c-1] !== 'B') c--
        } else {
             while(r > 0 && grid[r-1][c] !== 'B') r--
        }
        
        if (renderedGrid[r] && renderedGrid[r][c] && renderedGrid[r][c].number) {
            currentClueNumber = renderedGrid[r][c].number
        }
    }

    return { renderedGrid, numberMap, currentClueNumber }
}
