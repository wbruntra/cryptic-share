import express from 'express';
import { Database } from 'bun:sqlite';
import { getCrosswordClues } from './utils/openai';

const app = express();
const port = 3000;
const db = new Database('crossword.db');

// Helper to generate session ID
function generateSessionId(length = 12) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Increase limit for image uploads
app.use(express.json({ limit: '50mb' }));

// Get all puzzles (metadata only)
app.get('/api/puzzles', (req, res) => {
  const stmt = db.prepare('SELECT id, title FROM puzzles');
  const puzzles = stmt.all();
  res.json(puzzles);
});

// Get specific puzzle
app.get('/api/puzzles/:id', (req, res) => {
  const { id } = req.params;
  const stmt = db.prepare('SELECT * FROM puzzles WHERE id = ?');
  const puzzle = stmt.get(id) as any;

  if (puzzle) {
    // Parse clues back to JSON object
    puzzle.clues = JSON.parse(puzzle.clues as string);
    res.json(puzzle);
  } else {
    res.status(404).json({ error: 'Puzzle not found' });
  }
});

// Create new puzzle
app.post('/api/puzzles', (req, res) => {
  const { title, grid, clues } = req.body;
  
  if (!title || !grid || !clues) {
    return res.status(400).json({ error: 'Missing required fields: title, grid, clues' });
  }

  try {
    const stmt = db.prepare('INSERT INTO puzzles (title, grid, clues) VALUES ($title, $grid, $clues)');
    const result = stmt.run({
      $title: title,
      $grid: grid,
      $clues: JSON.stringify(clues)
    }) as any;
    
    res.status(201).json({ id: result.lastInsertRowid, title, grid, clues });
  } catch (error) {
    console.error('Error creating puzzle:', error);
    res.status(500).json({ error: 'Failed to create puzzle' });
  }
});

// Update puzzle grid and/or clues
app.put('/api/puzzles/:id', (req, res) => {
  const { id } = req.params;
  const { grid, clues } = req.body;

  // Check if puzzle exists
  const checkStmt = db.prepare('SELECT id FROM puzzles WHERE id = ?');
  const exists = checkStmt.get(id);
  
  if (!exists) {
    return res.status(404).json({ error: 'Puzzle not found' });
  }

  try {
    // Build dynamic update query based on what's provided
    const updates: string[] = [];
    const params: any = { $id: id };

    if (grid !== undefined) {
      updates.push('grid = $grid');
      params.$grid = grid;
    }
    
    if (clues !== undefined) {
      updates.push('clues = $clues');
      params.$clues = JSON.stringify(clues);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const sql = `UPDATE puzzles SET ${updates.join(', ')} WHERE id = $id`;
    const stmt = db.prepare(sql);
    stmt.run(params);
    
    res.json({ success: true, id });
  } catch (error) {
    console.error('Error updating puzzle:', error);
    res.status(500).json({ error: 'Failed to update puzzle' });
  }
});

// Transcribe clues from image
app.post('/api/clues/from-image', async (req, res) => {
  const { image } = req.body;
  if (!image) {
    return res.status(400).json({ error: 'Missing image data' });
  }

  // Remove data URL prefix if present
  const base64Image = image.replace(/^data:image\/\w+;base64,/, '');

  try {
    const clues = await getCrosswordClues(base64Image);
    res.json(clues);
  } catch (error: any) {
    console.error('Error transcribing clues:', error);
    res.status(500).json({ error: 'Failed to transcribe clues', details: error.message });
  }
});

// --- Session Endpoints ---

// Create a new session
app.post('/api/sessions', (req, res) => {
  const { puzzleId } = req.body;
  if (!puzzleId) {
    return res.status(400).json({ error: 'Missing puzzleId' });
  }

  const sessionId = generateSessionId();
  const initialState = '[]'; // Empty state initially

  try {
    const stmt = db.prepare('INSERT INTO puzzle_sessions (session_id, puzzle_id, state) VALUES (?, ?, ?)');
    stmt.run(sessionId, puzzleId, initialState);
    res.status(201).json({ sessionId });
  } catch (error) {
    console.error('Error creating session:', error);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// Get session details (puzzle + state)
app.get('/api/sessions/:sessionId', (req, res) => {
  const { sessionId } = req.params;

  try {
    const sessionStmt = db.prepare('SELECT * FROM puzzle_sessions WHERE session_id = ?');
    const session = sessionStmt.get(sessionId) as any;

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const puzzleStmt = db.prepare('SELECT * FROM puzzles WHERE id = ?');
    const puzzle = puzzleStmt.get(session.puzzle_id) as any;

    if (!puzzle) {
      return res.status(404).json({ error: 'Puzzle not found' });
    }

    puzzle.clues = JSON.parse(puzzle.clues as string);
    
    // Combine session state with puzzle data
    res.json({
      ...puzzle,
      sessionState: JSON.parse(session.state as string)
    });
  } catch (error) {
    console.error('Error fetching session:', error);
    res.status(500).json({ error: 'Failed to fetch session' });
  }
});

// Update session state
app.put('/api/sessions/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const { state } = req.body;

  if (state === undefined) {
    return res.status(400).json({ error: 'Missing state' });
  }

  try {
    const stmt = db.prepare('UPDATE puzzle_sessions SET state = ? WHERE session_id = ?');
    const result = stmt.run(JSON.stringify(state), sessionId);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating session:', error);
    res.status(500).json({ error: 'Failed to update session' });
  }
});

app.listen(port, () => {
  console.log(`Backend server running at http://localhost:${port}`);
});
