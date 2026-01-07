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

// Helper to generate session ID
function generateSessionId(length = 12) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Create a new session
router.post('/', async (req, res) => {
  const { puzzleId } = req.body;
  if (!puzzleId) {
    return res.status(400).json({ error: 'Missing puzzleId' });
  }

  const sessionId = generateSessionId();
  const initialState = '[]'; 

  try {
    await db('puzzle_sessions').insert({
      session_id: sessionId,
      puzzle_id: puzzleId,
      state: initialState
    });
    res.status(201).json({ sessionId });
  } catch (error) {
    console.error('Error creating session:', error);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// Get session details (puzzle + state)
router.get('/:sessionId', async (req, res) => {
  const { sessionId } = req.params;

  try {
    const session: any = await db('puzzle_sessions').where({ session_id: sessionId }).first();

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const puzzle: any = await db('puzzles').where({ id: session.puzzle_id }).first();

    if (!puzzle) {
      return res.status(404).json({ error: 'Puzzle not found' });
    }

    puzzle.clues = JSON.parse(puzzle.clues);
    
    res.json({
      ...puzzle,
      sessionState: JSON.parse(session.state)
    });
  } catch (error) {
    console.error('Error fetching session:', error);
    res.status(500).json({ error: 'Failed to fetch session' });
  }
});

// Update session state
router.put('/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  const { state } = req.body;

  if (state === undefined) {
    return res.status(400).json({ error: 'Missing state' });
  }

  try {
    const updated = await db('puzzle_sessions')
      .where({ session_id: sessionId })
      .update({ state: JSON.stringify(state) });

    if (updated === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating session:', error);
    res.status(500).json({ error: 'Failed to update session' });
  }
});

export default router;
