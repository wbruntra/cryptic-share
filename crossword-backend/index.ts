import express from 'express';
import puzzlesRouter from './routes/puzzles';
import sessionsRouter from './routes/sessions';
import cluesRouter from './routes/clues';

const app = express();
const port = 3000;

// Increase limit for image uploads
app.use(express.json({ limit: '50mb' }));

// Mount routes
app.use('/api/puzzles', puzzlesRouter);
app.use('/api/sessions', sessionsRouter);
app.use('/api/clues', cluesRouter);

app.listen(port, () => {
  console.log(`Backend server running at http://localhost:${port}`);
});
