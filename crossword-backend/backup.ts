import { Database } from 'bun:sqlite';
import fs from 'fs';

const db = new Database('crossword.db');

try {
  const puzzles = db.query('SELECT * FROM puzzles').all();
  // Check if puzzle_sessions exists first to avoid error if it doesn't (though we know it does)
  const sessionsExists = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='puzzle_sessions'").get();
  
  let sessions = [];
  if (sessionsExists) {
    sessions = db.query('SELECT * FROM puzzle_sessions').all();
  }

  const backup = {
    puzzles,
    sessions
  };

  fs.writeFileSync('backup_data.json', JSON.stringify(backup, null, 2));
  console.log('Backup successful: backup_data.json created');
  console.log(`Backed up ${puzzles.length} puzzles and ${sessions.length} sessions.`);
} catch (error) {
  console.error('Backup failed:', error);
}

db.close();
