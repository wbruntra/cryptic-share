import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import axios from 'axios'
import type { PuzzleSummary } from '../types'

export function HomePage() {
    const [puzzles, setPuzzles] = useState<PuzzleSummary[]>([])
    const [loading, setLoading] = useState(false)
    const navigate = useNavigate()

    useEffect(() => {
        setLoading(true)
        axios.get('/api/puzzles')
            .then(res => setPuzzles(res.data))
            .catch(console.error)
            .finally(() => setLoading(false))
    }, [])

    const handleStartSession = async (puzzleId: number) => {
        try {
            const res = await axios.post('/api/sessions', { puzzleId })
            const { sessionId } = res.data
            navigate(`/play/${sessionId}`)
        } catch (error) {
            console.error("Failed to start session:", error)
            alert("Failed to start session")
        }
    }

    return (
        <div className="home-page">
            <h1>Cryptic Crosswords</h1>
            
            <div className="actions">
                <Link to="/create" className="button">Create New Puzzle</Link>
            </div>

            <div className="puzzle-list">
                <h2>Available Puzzles</h2>
                {loading ? (
                    <p>Loading...</p>
                ) : (
                    <div className="puzzle-grid">
                        {puzzles.map(puzzle => (
                            <div key={puzzle.id} className="puzzle-card">
                                <h3>{puzzle.title}</h3>
                                <div className="puzzle-actions">
                                    <button onClick={() => handleStartSession(puzzle.id)}>
                                        Play
                                    </button>
                                    <Link to={`/edit/${puzzle.id}`} className="button button-secondary">
                                        Edit
                                    </Link>
                                </div>
                            </div>
                        ))}
                        {puzzles.length === 0 && (
                            <p>No puzzles found. Create one!</p>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
