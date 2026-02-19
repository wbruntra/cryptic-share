import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, fireEvent, act } from '@testing-library/react'
import { memo } from 'react'
import { renderWithProviders } from './test-utils'
import { CrosswordGrid } from './CrosswordGrid'
import * as GridCellModule from './GridCell'
import { setCursor, updateCell, moveCursor } from './store/slices/puzzleSlice'
import type { RenderedCell, CellType } from './types'

// Mock GridCell to track strict render counts
vi.mock('./GridCell', async (importOriginal) => {
  const actual = await importOriginal<typeof GridCellModule>()
  const spy = vi.fn((props) => <actual.GridCell {...props} />)
  const MemoizedGridCell = memo(spy)
  // Attach spy to the component so we can verify calls
  Object.assign(MemoizedGridCell, { spy })
  return {
    ...actual,
    GridCell: MemoizedGridCell,
  }
})

describe('CrosswordGrid Performance', () => {
  const renderedGrid: RenderedCell[][] = [
    [
      { type: 'N', number: 1, isSelected: true, isActiveWord: true, answer: '' }, // Selected cell
      { type: 'N', number: null, isSelected: false, isActiveWord: true, answer: '' }, // Next cell
    ],
  ]

  const stateGrid: CellType[][] = [['N', 'N']]

  // Mock initial state
  const preloadedState = {
    puzzle: {
      grid: stateGrid,
      answers: ['  '], // 2 spaces
      cursor: { r: 0, c: 0, direction: 'across' as const },
      clues: { across: [], down: [] },
      title: 'Test Puzzle',
      sessionId: 'test-session',
      puzzleId: 1,
      answersEncrypted: null,
      changedCells: [],
      showChangeNotification: false,
      correctFlashCells: [],
      incorrectFlashCells: [],
      isHintModalOpen: false,
      errorCells: [],
      isChecking: false,
      checkResult: {
        message: null,
        errorCount: 0,
        totalChecked: 0,
        isComplete: false,
        show: false,
      },
      attributions: {},
      lockedCells: new Set<string>(),
      isLockModeEnabled: true,
      isLoading: false,
      error: null,
      lastSyncedAt: 0,
    },
  }

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders GridCell once per cell on initial mount', () => {
    renderWithProviders(<CrosswordGrid grid={renderedGrid} mode="play" onCellClick={() => {}} />, {
      preloadedState,
    })

    // 2 cells total
    expect((GridCellModule.GridCell as any).spy).toHaveBeenCalledTimes(2)
  })

  it('re-renders minimal cells when typing', async () => {
    const { store } = renderWithProviders(
      <CrosswordGrid grid={renderedGrid} mode="play" onCellClick={() => {}} />,
      {
        preloadedState,
      },
    )

    // Reset counts from initial render
    vi.clearAllMocks()

    // Simulate typing 'A'
    // Note: CrosswordGrid doesn't handle typing itself, it's handled by usePuzzleInput in parent.
    // However, typing causes state update -> parent re-renders -> CrosswordGrid re-renders.
    // we want to test that IF CrosswordGrid re-renders with new props, only changed cells re-render.

    // BUT: standard RTL render() doesn't easily simulate parent re-render with new props unless we use rerender().
    // So let's simulate a re-render where we change the grid prop (as if user typed).

    const nextGrid: RenderedCell[][] = [
      [
        { type: 'N', number: 1, isSelected: false, isActiveWord: true, answer: 'A' }, // Changed: selected=false, answer='A'
        { type: 'N', number: null, isSelected: true, isActiveWord: true, answer: '' }, // Changed: selected=true
      ],
    ]

    const { rerender } = renderWithProviders(
      <CrosswordGrid grid={renderedGrid} mode="play" onCellClick={() => {}} />,
      { store },
    )

    // Clear mocks before rerender
    vi.clearAllMocks()

    // Rerender with new grid state (simulating typing effect)
    rerender(<CrosswordGrid grid={nextGrid} mode="play" onCellClick={() => {}} />)

    // Expect 2 GridCell calls (at 0,0 and 0,1)
    expect((GridCellModule.GridCell as any).spy).toHaveBeenCalledTimes(2)
  })

  it('does not re-render cells when parent re-renders with stable props', () => {
    // This simulates a timer tick or other unrelated state update in the parent
    // causing CrosswordGrid to re-render but with same props.

    // Use a stable handler to mimic useCallback
    const handleCellClick = vi.fn()

    const { rerender } = renderWithProviders(
      <CrosswordGrid grid={renderedGrid} mode="play" onCellClick={handleCellClick} />,
      { preloadedState },
    )

    vi.clearAllMocks()

    // Rerender with EXACTLY the same props (reference equality for grid/handler)
    rerender(<CrosswordGrid grid={renderedGrid} mode="play" onCellClick={handleCellClick} />)

    // Expect 0 calls because GridCell is memoized and props haven't changed.
    expect((GridCellModule.GridCell as any).spy).toHaveBeenCalledTimes(0)
  })
})
