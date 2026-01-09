import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { HomePage } from './pages/HomePage'
import { PlaySession } from './pages/PlaySession'
import { PuzzleCreator } from './pages/PuzzleCreator'
import { EditPuzzle } from './pages/EditPuzzle'
import { AdminDashboard } from './pages/AdminDashboard'
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
        <Route path="/create" element={<PuzzleCreator />} />
        <Route path="/edit/:puzzleId" element={<EditPuzzle />} />
        <Route path="/play/:sessionId" element={<PlaySession />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
