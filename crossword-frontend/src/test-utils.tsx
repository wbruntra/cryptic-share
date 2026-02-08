import React from 'react'
import type { PropsWithChildren } from 'react'
import { render } from '@testing-library/react'
import type { RenderOptions } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore, combineReducers } from '@reduxjs/toolkit'
import type { RootState } from './store/store'
import puzzleReducer from './store/slices/puzzleSlice'
// Import other reducers as needed, but for crossword perf tests we mainly need puzzle

// Create a custom render function that wraps with Redux Provider
interface ExtendedRenderOptions extends Omit<RenderOptions, 'queries'> {
  preloadedState?: Partial<RootState>
  store?: ReturnType<typeof setupStore>
}

export function setupStore(preloadedState?: Partial<RootState>) {
  return configureStore({
    reducer: combineReducers({
      puzzle: puzzleReducer,
      // Add other reducers if needed for specific tests
    }),
    preloadedState: preloadedState as any,
  })
}

export function renderWithProviders(
  ui: React.ReactElement,
  {
    preloadedState = {},
    store = setupStore(preloadedState),
    ...renderOptions
  }: ExtendedRenderOptions = {},
) {
  function Wrapper({ children }: PropsWithChildren<{}>): React.JSX.Element {
    return <Provider store={store}>{children}</Provider>
  }
  return { store, ...render(ui, { wrapper: Wrapper, ...renderOptions }) }
}
