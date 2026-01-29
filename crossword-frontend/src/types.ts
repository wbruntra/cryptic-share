export type CellType = 'N' | 'W' | 'B'
export type Mode = 'edit' | 'play' | 'view'
export type Direction = 'across' | 'down'

export interface PuzzleSummary {
  id: number
  title: string
}

export interface Clue {
  number: number
  clue: string
}

export interface AnswerEntry {
  number: number
  answer: string
}

export interface PuzzleAnswers {
  across: AnswerEntry[]
  down: AnswerEntry[]
}

export interface PuzzleData {
  id: number
  title: string
  grid: string
  clues: {
    across: Clue[]
    down: Clue[]
  }
}

export interface RenderedCell {
  type: CellType
  number: number | null
  isSelected: boolean
  isActiveWord: boolean
  answer: string
}

export interface User {
  id: number
  username: string
}

export interface RemoteSession {
  session_id: string
  puzzle_id: number
  title: string
  state: string
  is_complete: boolean
}
