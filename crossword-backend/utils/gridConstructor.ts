import type { CellType, Direction } from './answerChecker'
import { extractClueMetadata } from './answerChecker'

export interface AnswerLikeEntry {
  number: number
  answer?: string
  clue?: string
  length?: number
}

export interface GridConstructorInput {
  width: number
  height: number
  across: AnswerLikeEntry[]
  down: AnswerLikeEntry[]
}

export interface GridConstructorOptions {
  maxStates?: number
  maxMillis?: number
  templateGrids?: Array<string | CellType[][]>
  includeDiagnosticsInMessage?: boolean
}

export interface GridConstructorResult {
  success: boolean
  grid?: CellType[][]
  gridString?: string
  message?: string
  exploredStates: number
}

interface DirectionSpec {
  length: number
  answerLetters?: string
}

interface ClueLengthSpec {
  number: number
  direction: Direction
  length: number
}

interface NumberSpec {
  number: number
  across?: DirectionSpec
  down?: DirectionSpec
}

interface SolverState {
  boardKind: Int8Array // -1 unknown, 0 block, 1 letter
  boardChar: string[]
  chosenCandidates: Map<number, number>
}

type StopReason = 'max_states' | 'time_limit' | null

const UNKNOWN = -1
const BLOCK = 0
const LETTER = 1

function normalizeAnswerLetters(answer: string): string {
  return answer.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function parseLengthFromClue(clue: string): number | null {
  const match = clue.match(/\(([^)]+)\)\s*$/)
  if (!match || !match[1]) return null
  const parts = match[1].split(/[^0-9]+/).filter(Boolean)
  if (parts.length === 0) return null
  return parts.reduce((sum, p) => sum + Number(p), 0)
}

function getEntryLength(entry: AnswerLikeEntry): number {
  if (typeof entry.length === 'number' && entry.length > 0) {
    return entry.length
  }

  if (entry.answer) {
    const normalized = normalizeAnswerLetters(entry.answer)
    if (normalized.length > 0) return normalized.length
  }

  if (entry.clue) {
    const parsed = parseLengthFromClue(entry.clue)
    if (parsed && parsed > 0) return parsed
  }

  throw new Error(`Could not determine length for clue #${entry.number}`)
}

function buildSpecs(input: GridConstructorInput): NumberSpec[] {
  const byNumber = new Map<number, NumberSpec>()

  const upsert = (number: number): NumberSpec => {
    const existing = byNumber.get(number)
    if (existing) return existing
    const created: NumberSpec = { number }
    byNumber.set(number, created)
    return created
  }

  for (const entry of input.across) {
    const spec = upsert(entry.number)
    const length = getEntryLength(entry)
    spec.across = {
      length,
      answerLetters: entry.answer ? normalizeAnswerLetters(entry.answer) : undefined,
    }
  }

  for (const entry of input.down) {
    const spec = upsert(entry.number)
    const length = getEntryLength(entry)
    spec.down = {
      length,
      answerLetters: entry.answer ? normalizeAnswerLetters(entry.answer) : undefined,
    }
  }

  return [...byNumber.values()].sort((a, b) => a.number - b.number)
}

function toGridString(grid: CellType[][]): string {
  return grid.map((row) => row.join(' ')).join('\n')
}

function parseTemplateGrid(template: string | CellType[][]): CellType[][] {
  if (typeof template === 'string') {
    return template
      .trim()
      .split('\n')
      .map((row) => row.trim().split(' ') as CellType[])
  }
  return template.map((row) => [...row])
}

function indexToRowCol(index: number, width: number): { row: number; col: number } {
  return {
    row: Math.floor(index / width),
    col: index % width,
  }
}

function rowColToIndex(row: number, col: number, width: number): number {
  return row * width + col
}

function canSetBlock(state: SolverState, index: number): boolean {
  return state.boardKind[index] !== LETTER
}

function canSetLetter(state: SolverState, index: number, char?: string): boolean {
  if (state.boardKind[index] === BLOCK) return false
  if (!char) return true
  const existingChar = state.boardChar[index]
  return !existingChar || existingChar === char
}

function setBlock(state: SolverState, index: number): boolean {
  if (!canSetBlock(state, index)) return false
  state.boardKind[index] = BLOCK
  state.boardChar[index] = ''
  return true
}

function setLetter(state: SolverState, index: number, char?: string): boolean {
  if (!canSetLetter(state, index, char)) return false
  state.boardKind[index] = LETTER
  if (char) state.boardChar[index] = char
  return true
}

function cloneState(state: SolverState): SolverState {
  return {
    boardKind: state.boardKind.slice(),
    boardChar: [...state.boardChar],
    chosenCandidates: new Map(state.chosenCandidates),
  }
}

function buildGridFromState(
  width: number,
  height: number,
  boardKind: Int8Array,
  startIndices: Set<number>,
): CellType[][] {
  const grid: CellType[][] = []
  for (let r = 0; r < height; r++) {
    const row: CellType[] = []
    for (let c = 0; c < width; c++) {
      const idx = rowColToIndex(r, c, width)
      if (boardKind[idx] === BLOCK || boardKind[idx] === UNKNOWN) {
        row.push('B')
      } else if (startIndices.has(idx)) {
        row.push('N')
      } else {
        row.push('W')
      }
    }
    grid.push(row)
  }
  return grid
}

function validateConstructedGrid(
  grid: CellType[][],
  specs: NumberSpec[],
  expectedAcross: Map<number, DirectionSpec>,
  expectedDown: Map<number, DirectionSpec>,
): boolean {
  const metadata = extractClueMetadata(grid)

  const byAcross = new Map<number, { row: number; col: number }>()
  const byDown = new Map<number, { row: number; col: number }>()

  for (const clue of metadata) {
    if (clue.direction === 'across') {
      byAcross.set(clue.number, { row: clue.row, col: clue.col })
    } else {
      byDown.set(clue.number, { row: clue.row, col: clue.col })
    }
  }

  if (byAcross.size !== expectedAcross.size || byDown.size !== expectedDown.size) {
    return false
  }

  const measureLength = (row: number, col: number, direction: Direction): number => {
    let length = 0
    let r = row
    let c = col
    while (r < grid.length && c < grid[0]!.length && grid[r]![c] !== 'B') {
      length++
      if (direction === 'across') c++
      else r++
    }
    return length
  }

  for (const spec of specs) {
    if (spec.across) {
      const pos = byAcross.get(spec.number)
      if (!pos) return false
      const len = measureLength(pos.row, pos.col, 'across')
      if (len !== spec.across.length) return false
    }
    if (spec.down) {
      const pos = byDown.get(spec.number)
      if (!pos) return false
      const len = measureLength(pos.row, pos.col, 'down')
      if (len !== spec.down.length) return false
    }
  }

  return true
}

function getExpectedClueLengthSpecs(specs: NumberSpec[]): ClueLengthSpec[] {
  const out: ClueLengthSpec[] = []
  for (const spec of specs) {
    if (spec.across) {
      out.push({ number: spec.number, direction: 'across', length: spec.across.length })
    }
    if (spec.down) {
      out.push({ number: spec.number, direction: 'down', length: spec.down.length })
    }
  }
  return out
}

function getGridClueLengthSpecs(grid: CellType[][]): ClueLengthSpec[] {
  const metadata = extractClueMetadata(grid)
  const out: ClueLengthSpec[] = []

  for (const clue of metadata) {
    let length = 0
    let r = clue.row
    let c = clue.col

    while (r < grid.length && c < grid[0]!.length && grid[r]![c] !== 'B') {
      length++
      if (clue.direction === 'across') c++
      else r++
    }

    out.push({ number: clue.number, direction: clue.direction, length })
  }

  return out
}

function clueLengthSignature(items: ClueLengthSpec[]): string {
  return items
    .map((x) => `${x.number}-${x.direction === 'across' ? 'a' : 'd'}-${x.length}`)
    .sort()
    .join('|')
}

export function getAnswerKeyLengthSignature(input: GridConstructorInput): string {
  const specs = buildSpecs(input)
  return clueLengthSignature(getExpectedClueLengthSpecs(specs))
}

export function getGridLengthSignature(grid: CellType[][]): string {
  return clueLengthSignature(getGridClueLengthSpecs(grid))
}

function findTemplateGridMatch(
  input: GridConstructorInput,
  templateGrids: Array<string | CellType[][]>,
): CellType[][] | null {
  if (templateGrids.length === 0) return null

  const expectedSignature = getAnswerKeyLengthSignature(input)
  const matches: CellType[][][] = []

  for (const template of templateGrids) {
    const grid = parseTemplateGrid(template)
    if (grid.length !== input.height || (grid[0]?.length ?? 0) !== input.width) continue
    if (getGridLengthSignature(grid) === expectedSignature) {
      matches.push(grid)
    }
  }

  if (matches.length === 1) return matches[0]!
  return null
}

// ----------------------------------------------------------------------
// NEW SOLVER IMPLEMENTATION
// ----------------------------------------------------------------------

// Checks if placing a spec at cellIndex is valid given current state
// NON-DESTRUCTIVE check
function checkPlacement(
  state: SolverState,
  width: number,
  height: number,
  cellIndex: number,
  spec: NumberSpec,
): boolean {
  // 1. Check start cell
  if (!canSetLetter(state, cellIndex)) return false

  const { row, col } = indexToRowCol(cellIndex, width)

  // 2. Check Across
  if (spec.across) {
    const { length, answerLetters } = spec.across
    if (col + length > width) return false

    // Before block
    if (col > 0) {
      if (!canSetBlock(state, rowColToIndex(row, col - 1, width))) return false
    }
    // After block
    if (col + length < width) {
      if (!canSetBlock(state, rowColToIndex(row, col + length, width))) return false
    }
    // Word cells
    for (let i = 0; i < length; i++) {
      const idx = rowColToIndex(row, col + i, width)
      const char = answerLetters?.[i]
      if (!canSetLetter(state, idx, char)) return false
    }
  }

  // 3. Check Down
  if (spec.down) {
    const { length, answerLetters } = spec.down
    if (row + length > height) return false

    // Before block
    if (row > 0) {
      if (!canSetBlock(state, rowColToIndex(row - 1, col, width))) return false
    }
    // After block
    if (row + length < height) {
      if (!canSetBlock(state, rowColToIndex(row + length, col, width))) return false
    }
    // Word cells
    for (let i = 0; i < length; i++) {
      const idx = rowColToIndex(row + i, col, width)
      const char = answerLetters?.[i]
      if (!canSetLetter(state, idx, char)) return false
    }
  }

  return true
}

// Applies placement to state
// Assumes checkPlacement was true
function applyPlacement(
  state: SolverState,
  width: number,
  height: number,
  cellIndex: number,
  spec: NumberSpec,
) {
  setLetter(state, cellIndex)
  const { row, col } = indexToRowCol(cellIndex, width)

  if (spec.across) {
    const { length, answerLetters } = spec.across
    // Block before
    if (col > 0) setBlock(state, rowColToIndex(row, col - 1, width))
    // Block after
    if (col + length < width) setBlock(state, rowColToIndex(row, col + length, width))
    // Letters
    for (let i = 0; i < length; i++) {
      setLetter(state, rowColToIndex(row, col + i, width), answerLetters?.[i])
    }
  }

  if (spec.down) {
    const { length, answerLetters } = spec.down
    // Block before
    if (row > 0) setBlock(state, rowColToIndex(row - 1, col, width))
    // Block after
    if (row + length < height) setBlock(state, rowColToIndex(row + length, col, width))
    // Letters
    for (let i = 0; i < length; i++) {
      setLetter(state, rowColToIndex(row + i, col, width), answerLetters?.[i])
    }
  }
}

export function constructGridFromAnswerKey(
  input: GridConstructorInput,
  options: GridConstructorOptions = {},
): GridConstructorResult {
  const maxStates = options.maxStates ?? 500_000
  const maxMillis = options.maxMillis ?? 4_000
  const templateGrids = options.templateGrids ?? []
  const includeDiagnosticsInMessage = options.includeDiagnosticsInMessage ?? false

  if (input.width <= 0 || input.height <= 0) {
    return { success: false, message: 'Grid dimensions must be positive', exploredStates: 0 }
  }

  const specs = buildSpecs(input)
  if (specs.length === 0) {
    return { success: false, message: 'No clues provided', exploredStates: 0 }
  }

  const expectedAcross = new Map<number, DirectionSpec>()
  const expectedDown = new Map<number, DirectionSpec>()
  for (const s of specs) {
    if (s.across) expectedAcross.set(s.number, s.across)
    if (s.down) expectedDown.set(s.number, s.down)
  }

  const totalCells = input.width * input.height
  const initialState: SolverState = {
    boardKind: new Int8Array(totalCells).fill(UNKNOWN),
    boardChar: Array(totalCells).fill(''),
    chosenCandidates: new Map(),
  }

  let exploredStates = 0
  let stopReason: StopReason = null
  const startedAt = Date.now()
  let completeAssignmentsChecked = 0
  let candidatePlacementsChecked = 0

  // 1. Precompute valid candidates for each spec (Static geometric check only)
  const candidateMap = new Map<number, number[]>()

  const isValidCandidateStatic = (spec: NumberSpec, idx: number): boolean => {
    const { row, col } = indexToRowCol(idx, input.width)
    if (spec.across && col + spec.across.length > input.width) return false
    if (spec.down && row + spec.down.length > input.height) return false
    return true
  }

  for (const spec of specs) {
    const candidates: number[] = []
    for (let i = 0; i < totalCells; i++) {
      if (isValidCandidateStatic(spec, i)) {
        candidates.push(i)
      }
    }
    candidateMap.set(spec.number, candidates)
  }

  const search = (
    specIndex: number,
    minCellIndex: number,
    currentState: SolverState,
  ): SolverState | null => {
    // Check limits less frequently to improve perf
    if (exploredStates % 100 === 0 && Date.now() - startedAt > maxMillis) {
      stopReason = 'time_limit'
      return null
    }

    if (exploredStates >= maxStates) {
      stopReason = 'max_states'
      return null
    }

    if (specIndex >= specs.length) {
      completeAssignmentsChecked++
      const grid = buildGridFromState(
        input.width,
        input.height,
        currentState.boardKind,
        new Set(currentState.chosenCandidates.values()),
      )
      if (validateConstructedGrid(grid, specs, expectedAcross, expectedDown)) {
        return currentState
      }
      return null
    }

    exploredStates++

    const spec = specs[specIndex]!
    const candidates = candidateMap.get(spec.number) || []

    // Filter by minCellIndex
    let startIdxInCandidates = 0
    while (
      startIdxInCandidates < candidates.length &&
      candidates[startIdxInCandidates]! <= minCellIndex
    ) {
      startIdxInCandidates++
    }

    for (let i = startIdxInCandidates; i < candidates.length; i++) {
      const cellIndex = candidates[i]!
      candidatePlacementsChecked++

      // 1. Check if placement is valid on CURRENT board
      if (!checkPlacement(currentState, input.width, input.height, cellIndex, spec)) {
        continue
      }

      // 2. Mock up next state (clone & apply)
      // Optimization: We could do this check more lazily, but cloning is safer
      const nextState = cloneState(currentState)
      applyPlacement(nextState, input.width, input.height, cellIndex, spec)
      nextState.chosenCandidates.set(spec.number, cellIndex)

      // 3. Forward Checking (Lookahead)
      // Ensure all FUTURE specs have at least one valid candidate remaining.
      let forwardCheckPassed = true
      let lastMinIndex = cellIndex

      for (let j = specIndex + 1; j < specs.length; j++) {
        const nextSpec = specs[j]!
        const nextCandidates = candidateMap.get(nextSpec.number) || []

        // We need >= 1 valid candidate for nextSpec that is > lastMinIndex
        let foundValid = false

        // Find start in sorted candidates array
        let k = 0
        while (k < nextCandidates.length && nextCandidates[k]! <= lastMinIndex) {
          k++
        }

        // Search for at least one valid placement
        for (; k < nextCandidates.length; k++) {
          const futureCand = nextCandidates[k]!
          if (checkPlacement(nextState, input.width, input.height, futureCand, nextSpec)) {
            foundValid = true
            // Constraint Propagation: S[j] must be >= futureCand
            // So S[j+1] must be > futureCand
            lastMinIndex = futureCand
            break
          }
        }

        if (!foundValid) {
          forwardCheckPassed = false
          break
        }
      }

      if (forwardCheckPassed) {
        const result = search(specIndex + 1, cellIndex, nextState)
        if (result) return result
      }
    }

    return null
  }

  const solvedState = search(0, -1, initialState)

  if (!solvedState) {
    const templateMatch = findTemplateGridMatch(input, templateGrids)
    if (templateMatch) {
      return {
        success: true,
        grid: templateMatch,
        gridString: toGridString(templateMatch),
        exploredStates,
        message: 'Solved via template signature match',
      }
    }

    let reasonMessage = ''

    if (stopReason === 'time_limit') {
      reasonMessage = `No valid grid found before time limit (${maxMillis}ms)`
    } else if (stopReason === 'max_states') {
      reasonMessage = `No valid grid found within ${maxStates.toLocaleString()} explored states`
    } else {
      reasonMessage = 'No valid grid satisfies all constraints (search exhausted)'
    }

    if (includeDiagnosticsInMessage) {
      reasonMessage += ` [explored=${exploredStates.toLocaleString()}, placements=${candidatePlacementsChecked.toLocaleString()}, completeAssignments=${completeAssignmentsChecked.toLocaleString()}]`
    }

    return {
      success: false,
      exploredStates,
      message: reasonMessage,
    }
  }

  const grid = buildGridFromState(
    input.width,
    input.height,
    solvedState.boardKind,
    new Set(solvedState.chosenCandidates.values()),
  )

  return {
    success: true,
    grid,
    gridString: toGridString(grid),
    exploredStates,
  }
}
