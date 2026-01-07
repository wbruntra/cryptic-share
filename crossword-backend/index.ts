import express from 'express';
import { Database } from 'bun:sqlite';

const app = express();
const port = 3000;
const db = new Database('crossword.db');

app.use(express.json());

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

app.listen(port, () => {
  console.log(`Backend server running at http://localhost:${port}`);
});
