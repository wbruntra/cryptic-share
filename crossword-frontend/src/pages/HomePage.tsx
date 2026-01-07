import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import axios from 'axios'
import type { PuzzleSummary } from '../types'
import { SkeletonPuzzleCard } from '../components/SkeletonLoader'
import { getLocalSessions, saveLocalSession, type LocalSession } from '../utils/sessionManager'

export function HomePage() {
    const [puzzles, setPuzzles] = useState<PuzzleSummary[]>([])
    const [recentSessions, setRecentSessions] = useState<LocalSession[]>([])
    const [loading, setLoading] = useState(false)
    const navigate = useNavigate()

    useEffect(() => {
        setLoading(true)
        axios.get('/api/puzzles')
            .then(res => setPuzzles(res.data))
            .catch(console.error)
            .finally(() => setLoading(false))
        
        setRecentSessions(getLocalSessions())
    }, [])

    const handleStartSession = async (puzzleId: number, puzzleTitle: string) => {
        try {
            const res = await axios.post('/api/sessions', { puzzleId })
            const { sessionId } = res.data
            
            saveLocalSession({
                sessionId,
                puzzleId,
                puzzleTitle,
                lastPlayed: Date.now()
            })

            navigate(`/play/${sessionId}`)
        } catch (error) {
            console.error("Failed to start session:", error)
            alert("Failed to start session")
        }
    }

    return (
        <div className="home-page">
            
            {/* User Dashboard - No Create Button */}

            {recentSessions.length > 0 && (
                <div className="puzzle-list" style={{ marginBottom: '3rem' }}>
                    <h2>Continue Playing</h2>
                    <div className="puzzle-grid">
                        {recentSessions.map(session => (
                            <div key={session.sessionId} className="puzzle-card">
                                <h3>{session.puzzleTitle}</h3>
                                <p style={{ fontSize: '0.9em', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                                    Last played: {new Date(session.lastPlayed).toLocaleDateString()}
                                </p>
                                <div className="puzzle-actions">
                                    <Link to={`/play/${session.sessionId}`} className="button button-primary">
                                        Resume
                                    </Link>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="puzzle-list">
                <h2>Available Puzzles</h2>
                {loading ? (
                    <div className="puzzle-grid">
                        {[1, 2, 3, 4].map(i => (
                            <SkeletonPuzzleCard key={i} />
                        ))}
                    </div>
                ) : (
                    <div className="puzzle-grid">
                        {puzzles.map(puzzle => (
                            <div key={puzzle.id} className="puzzle-card">
                                <h3>{puzzle.title}</h3>
                                <div className="puzzle-actions">
                                    <button 
                                        onClick={() => handleStartSession(puzzle.id, puzzle.title)}
                                        className="button button-primary"
                                    >
                                        Play
                                    </button>
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
