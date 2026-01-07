import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { HomePage } from './pages/HomePage'
import { PlaySession } from './pages/PlaySession'
import { PuzzleCreator } from './pages/PuzzleCreator'
import './App.css'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/create" element={<PuzzleCreator />} />
        <Route path="/play/:sessionId" element={<PlaySession />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
