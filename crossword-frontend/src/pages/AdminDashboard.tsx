import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import type { PuzzleSummary } from '../types'
import { SkeletonPuzzleCard } from '../components/SkeletonLoader'

export function AdminDashboard() {
    const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
    const [password, setPassword] = useState('')
    const [loginError, setLoginError] = useState('')
    const [puzzles, setPuzzles] = useState<PuzzleSummary[]>([])
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        checkAuth();
    }, [])

    const checkAuth = async () => {
        try {
            await axios.get('/api/check-auth');
            setIsAuthenticated(true);
            fetchPuzzles();
        } catch {
            setIsAuthenticated(false);
        }
    }

    const fetchPuzzles = () => {
        setLoading(true)
        axios.get('/api/puzzles')
            .then(res => setPuzzles(res.data))
            .catch(console.error)
            .finally(() => setLoading(false))
    }

    const handleDelete = async (id: number) => {
        if (!confirm('Are you sure you want to delete this puzzle? This action cannot be undone.')) return;
        try {
            await axios.delete(`/api/puzzles/${id}`);
            fetchPuzzles();
        } catch (error) {
            console.error('Failed to delete puzzle:', error);
            alert('Failed to delete puzzle.');
        }
    }

    const handleRename = async (id: number, currentTitle: string) => {
        const newTitle = prompt('Enter new title:', currentTitle);
        if (!newTitle || newTitle === currentTitle) return;
        
        try {
            await axios.put(`/api/puzzles/${id}`, { title: newTitle });
            fetchPuzzles();
        } catch (error) {
            console.error('Failed to rename puzzle:', error);
            alert('Failed to rename puzzle.');
        }
    }

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoginError('');
        try {
            await axios.post('/api/login', { password });
            setIsAuthenticated(true);
            fetchPuzzles();
        } catch {
            setLoginError('Invalid password');
        }
    }

    if (isAuthenticated === null) return <div className="loading">Checking auth...</div>;

    if (!isAuthenticated) {
        return (
            <div className="admin-login" style={{ maxWidth: '400px', margin: '4rem auto' }}>
                <h1>Admin Access</h1>
                <form onSubmit={handleLogin} className="card">
                    <div className="form-group">
                        <label style={{ display: 'block', marginBottom: '0.5rem' }}>Password</label>
                        <input 
                            type="password" 
                            value={password} 
                            onChange={e => setPassword(e.target.value)}
                            placeholder="Enter admin password"
                            style={{ width: '100%', padding: '0.5rem', marginBottom: '1rem' }}
                        />
                    </div>
                    {loginError && <p className="error-message" style={{ marginBottom: '1rem' }}>{loginError}</p>}
                    <button type="submit" className="button button-primary" style={{ width: '100%' }}>
                        Login
                    </button>
                </form>
            </div>
        )
    }

    return (
        <div className="admin-dashboard">
            <h1>Admin Dashboard</h1>
            
            <div className="actions" style={{ marginBottom: '2rem' }}>
                <Link to="/create" className="button button-primary">Create New Puzzle</Link>
            </div>

            <div className="puzzle-list">
                <h2>Manage Puzzles</h2>
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
                                    <Link to={`/edit/${puzzle.id}`} className="button button-primary">
                                        Edit
                                    </Link>
                                    <button 
                                        onClick={() => handleRename(puzzle.id, puzzle.title)}
                                        className="button button-secondary"
                                    >
                                        Rename
                                    </button>
                                    <button 
                                        onClick={() => handleDelete(puzzle.id)}
                                        className="button button-destructive"
                                    >
                                        Delete
                                    </button>
                                </div>
                            </div>
                        ))}
                        {puzzles.length === 0 && (
                            <p>No puzzles found.</p>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
