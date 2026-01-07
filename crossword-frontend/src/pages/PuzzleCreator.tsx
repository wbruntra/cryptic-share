import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { CreatePuzzleForm } from '../CreatePuzzleForm'

export function PuzzleCreator() {
  const navigate = useNavigate()

  const handleCreate = async (title: string, grid: string, cluesJson: string) => {
    try {
      const clues = JSON.parse(cluesJson)
      await axios.post('/api/puzzles', {
        title,
        grid,
        clues,
      })
      navigate('/admin')
    } catch (error) {
      console.error('Failed to create puzzle:', error)
      throw error // Propagate to form for error handling
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 pb-12">
      <CreatePuzzleForm onSubmit={handleCreate} onCancel={() => navigate('/admin')} />
    </div>
  )
}
