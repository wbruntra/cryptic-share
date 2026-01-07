import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';

export function NavBar() {
    const [theme, setTheme] = useState(() => {
        return localStorage.getItem('theme') || 'dark';
    });

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
    }, [theme]);

    const toggleTheme = () => {
        setTheme(prev => prev === 'dark' ? 'light' : 'dark');
    };

    return (
        <nav className="navbar">
            <div className="navbar-content">
                <Link to="/" className="navbar-brand">
                    Cryptic Share
                </Link>
                <div className="navbar-links">
                    <Link to="/" className="nav-link">Home</Link>
                    <Link to="/admin" className="nav-link">Admin</Link>
                    <button onClick={toggleTheme} style={{ padding: '0.4em 0.8em', fontSize: '0.9em' }}>
                        {theme === 'dark' ? '☀️' : '🌙'}
                    </button>
                </div>
            </div>
        </nav>
    );
}
