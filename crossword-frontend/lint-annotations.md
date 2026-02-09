# Lint annotations (performance focus)

## High impact: render purity / cascading renders
- `src/components/HintModal.tsx`
  - `react-hooks/set-state-in-effect` for cached/pending updates and open reset.
  - **Impact:** extra render cascades while modal is open.
  - **Action:** refactored to remount content on open and derive explanation state (no effect-driven setState).

- `src/pages/EditPuzzle.tsx`
  - `react-hooks/set-state-in-effect` for syncing puzzle data and validation.
  - **Impact:** render cascades on data fetch / editing.
  - **Action:** key a form component to the puzzle and compute validation via `useMemo`.

- `src/hooks/usePuzzleTimer.ts`
  - `react-hooks/purity` for `Date.now()` in render.
  - **Impact:** unstable renders and potential timer drift on re-render.
  - **Action:** initialize refs with 0 and set them inside the effect.

- `src/pages/HomePage.tsx`
  - `react-hooks/purity` for `Date.now()` usage.
  - **Impact:** purity rule violation; potential inconsistent render expectations.
  - **Action:** move timestamp creation into a helper outside the component.

## Medium/low impact (deferred)
- `no-unused-vars` warnings (e.g., `ImageCropperDialog.tsx`, `NavBar.tsx`, `PlaySession.tsx`).
- `no-explicit-any` errors in API and utils files.
- Dependency warnings (`react-hooks/exhaustive-deps`) in `PlaySession.tsx` and `ExplanationReviewPage.tsx`.

## Notes
- This file tracks performance-impacting lint errors first. Update this list as fixes land.
