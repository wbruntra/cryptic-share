import { Router } from 'express';
import knex from 'knex';

const router = Router();

const db = knex({
  client: 'sqlite3',
  connection: {
    filename: './crossword.db'
  },
  useNullAsDefault: true
});

// Get all puzzles (metadata only)
router.get('/', async (req, res) => {
  try {
    const puzzles = await db('puzzles').select('id', 'title');
    res.json(puzzles);
  } catch (error) {
    console.error('Error fetching puzzles:', error);
    res.status(500).json({ error: 'Failed to fetch puzzles' });
  }
});

// Get specific puzzle
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const puzzle: any = await db('puzzles').where({ id }).first();

    if (puzzle) {
      puzzle.clues = JSON.parse(puzzle.clues);
      res.json(puzzle);
    } else {
      res.status(404).json({ error: 'Puzzle not found' });
    }
  } catch (error) {
    console.error('Error fetching puzzle:', error);
    res.status(500).json({ error: 'Failed to fetch puzzle' });
  }
});

// Create new puzzle
router.post('/', async (req, res) => {
  const { title, grid, clues } = req.body;
  
  if (!title || !grid || !clues) {
    return res.status(400).json({ error: 'Missing required fields: title, grid, clues' });
  }

  try {
    const [id] = await db('puzzles').insert({
      title,
      grid,
      clues: JSON.stringify(clues)
    });
    res.status(201).json({ id, title, grid, clues });
  } catch (error) {
    console.error('Error creating puzzle:', error);
    res.status(500).json({ error: 'Failed to create puzzle' });
  }
});

// Update puzzle grid and/or clues
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { grid, clues } = req.body;

  try {
    const exists = await db('puzzles').where({ id }).first();
    
    if (!exists) {
      return res.status(404).json({ error: 'Puzzle not found' });
    }

    const updates: any = {};
    if (grid !== undefined) updates.grid = grid;
    if (clues !== undefined) updates.clues = JSON.stringify(clues);

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    await db('puzzles').where({ id }).update(updates);
    res.json({ success: true, id });
  } catch (error) {
    console.error('Error updating puzzle:', error);
    res.status(500).json({ error: 'Failed to update puzzle' });
  }
});

export default router;
