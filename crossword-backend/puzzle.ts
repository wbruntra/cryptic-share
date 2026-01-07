import { db } from './db';

export interface PuzzleSummary {
  id: number;
  title: string;
}

export const deletePuzzle = (id: number | string): boolean => {
  const stmt = db.prepare('DELETE FROM puzzles WHERE id = ?');
  const result = stmt.run(id);
  return result.changes > 0;
};

export const getAllPuzzles = (): PuzzleSummary[] => {
  const stmt = db.prepare('SELECT id, title FROM puzzles');
  return stmt.all() as PuzzleSummary[];
};
