import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { HomePage } from './pages/HomePage'
import { PlaySession } from './pages/PlaySession'
import { PuzzleCreator } from './pages/PuzzleCreator'
import { EditPuzzle } from './pages/EditPuzzle'
import { AdminDashboard } from './pages/AdminDashboard'
import { ReportManagementPage } from './pages/ReportManagementPage'
import { ExplanationReviewPage } from './pages/ExplanationReviewPage'
import { SessionListPage } from './pages/SessionListPage'
import { MissingCluesPage } from './pages/MissingCluesPage'
import { EditPuzzleClues } from './pages/EditPuzzleClues'
import AuthPage from './pages/AuthPage'
import { NavBar } from './components/NavBar'
import { useViewportCssVars } from './utils/useViewportCssVars'

function App() {
  useViewportCssVars()

  return (
    <BrowserRouter>
      <NavBar />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/admin/sessions" element={<SessionListPage />} />
        <Route path="/admin/reports" element={<ReportManagementPage />} />
        <Route path="/admin/missing-clues" element={<MissingCluesPage />} />
        <Route path="/admin/clues/:puzzleId" element={<EditPuzzleClues />} />
        <Route path="/admin/puzzles/:id/explanations" element={<ExplanationReviewPage />} />
        <Route path="/create" element={<PuzzleCreator />} />
        <Route path="/edit/:puzzleId" element={<EditPuzzle />} />

        {/* Gameplay Routes - Use GameConnectionProvider (SSE) internally */}
        <Route path="/play/:sessionId" element={<PlaySession />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
