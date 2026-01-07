import express from 'express';
import cookieParser from 'cookie-parser';
import puzzlesRouter from './routes/puzzles';
import sessionsRouter from './routes/sessions';
import cluesRouter from './routes/clues';
import { ADMIN_PASSWORD, COOKIE_SECRET, SESSION_TOKEN } from './config';

const app = express();
const port = 3000;

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(cookieParser(COOKIE_SECRET));

// Login Route
app.post('/api/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    res.cookie('admin_token', SESSION_TOKEN, {
      httpOnly: true,
      signed: true,
      maxAge: 24 * 60 * 60 * 1000 // 1 day
    });
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Invalid password' });
  }
});

// Check Auth Route (for frontend state)
app.get('/api/check-auth', (req, res) => {
  if (req.signedCookies?.admin_token === SESSION_TOKEN) {
    res.json({ authenticated: true });
  } else {
    res.status(401).json({ authenticated: false });
  }
});

// Mount routes
app.use('/api/puzzles', puzzlesRouter);
app.use('/api/sessions', sessionsRouter);
app.use('/api/clues', cluesRouter);

app.listen(port, () => {
  console.log(`Backend server running at http://localhost:${port}`);
});
