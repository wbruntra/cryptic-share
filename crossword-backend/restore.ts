import { Database } from 'bun:sqlite';
import fs from 'fs';

const db = new Database('crossword.db');

try {
  // Read backup data
  const backupData = JSON.parse(fs.readFileSync('backup_data.json', 'utf-8'));
  
  console.log(`Restoring ${backupData.puzzles.length} puzzles...`);
  const insertPuzzle = db.prepare('INSERT INTO puzzles (id, title, grid, clues) VALUES (?, ?, ?, ?)');
  backupData.puzzles.forEach((puzzle: any) => {
    insertPuzzle.run(puzzle.id, puzzle.title, puzzle.grid, puzzle.clues);
  });
  
  if (backupData.sessions && backupData.sessions.length > 0) {
    console.log(`Restoring ${backupData.sessions.length} sessions...`);
    const insertSession = db.prepare('INSERT INTO puzzle_sessions (session_id, puzzle_id, state) VALUES (?, ?, ?)');
    backupData.sessions.forEach((session: any) => {
      insertSession.run(session.session_id, session.puzzle_id, session.state);
    });
  } else {
    console.log('No sessions to restore.');
  }
  
  console.log('Data restored successfully!');
  
} catch (error) {
  console.error('Restore failed:', error);
} finally {
  db.close();
}
