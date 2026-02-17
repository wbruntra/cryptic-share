import { checkSessionAnswers } from '../utils/answerChecker';
import { PuzzleService } from '../services/puzzleService';
import { describe, it, expect, spyOn, beforeAll, afterAll } from 'bun:test';

// Mock Data
const MOCK_GRID = `
N W N W N W N B N W N W N W B
W B W B W B W B W B W B W B N
N W W W W W W B N W W W W W W
W B W B B B W B W B W B W B W
N W W B N W W W W W W W W W W
W B W B N B B B W B B B W B W
N W W W W B N W W W W N W W W
B B W B W B W B W B W B W B B
N W W W W W W W W B N W W W N
W B W B B B W B B B W B W B W
N W W W N W W W W N W B N W W
W B W B W B W B W B B B W B W
N W W W W W W B N W N W W W W
W B W B W B B B W B W B W B W
B N W W W W W B N W W W W W W
`.trim();

const MOCK_ANSWERS = {
  across: [
    { number: 1, answer: 'Hyphens' },
    { number: 5, answer: 'Depict' },
    { number: 9, answer: 'Lullaby' },
    { number: 10, answer: 'Trounce' },
    { number: 11, answer: 'Sic' },
    { number: 12, answer: 'Thenceforth' },
    { number: 13, answer: 'Emcee' },
    { number: 14, answer: 'Mall order' },
    { number: 16, answer: 'Vengeance' },
    { number: 17, answer: 'Excel' },
    { number: 19, answer: 'Sitting down' },
    { number: 22, answer: 'Own' },
    { number: 23, answer: 'Tubbier' },
    { number: 24, answer: 'Elegiac' },
    { number: 26, answer: 'League' },
    { number: 27, answer: 'Analyst' }
  ],
  down: [
    { number: 1, answer: 'Holy See' },
    { number: 2, answer: 'Police constable' },
    { number: 3, answer: 'Era' },
    { number: 4, answer: 'Style' },
    { number: 5, answer: 'Detective' },
    { number: 6, answer: 'Proof' },
    { number: 7, answer: 'Contradictorily' },
    { number: 8, answer: 'Tether' },
    { number: 12, answer: 'There' },
    { number: 14, answer: 'Menagerie' },
    { number: 15, answer: 'Ocean' },
    { number: 16, answer: 'Visits' },
    { number: 18, answer: 'Linocut' },
    { number: 20, answer: 'Icing' },
    { number: 21, answer: 'Omega' },
    { number: 25, answer: 'Eta' }
  ]
};

// Encrypt answers (ROT13) to match what answerChecker expects
const rot13 = (str: string) => {
  return str.replace(/[a-zA-Z]/g, (c) => {
    const base = c <= 'Z' ? 65 : 97;
    return String.fromCharCode(base + ((c.charCodeAt(0) - base + 13) % 26));
  });
};

const ENCRYPTED_ANSWERS = {
  across: MOCK_ANSWERS.across.map(a => ({ ...a, answer: rot13(a.answer) })),
  down: MOCK_ANSWERS.down.map(a => ({ ...a, answer: rot13(a.answer) }))
};

const MOCK_PUZZLE = {
  id: 1,
  title: 'Benchmark Puzzle',
  grid: MOCK_GRID,
  answers: ENCRYPTED_ANSWERS // answerChecker uses puzzle.answers if available
};

describe('Performance Benchmark', () => {
  let getPuzzleByIdSpy: any;

  beforeAll(() => {
    // Mock the service
    getPuzzleByIdSpy = spyOn(PuzzleService, 'getPuzzleById').mockResolvedValue(MOCK_PUZZLE);
  });

  afterAll(() => {
    getPuzzleByIdSpy.mockRestore();
  });

  it('measures checkSessionAnswers performance', async () => {
    const emptyState: string[] = []; // or properly sized array
    const iterations = 1000;

    // Warmup
    await checkSessionAnswers(1, emptyState);

    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      await checkSessionAnswers(1, emptyState);
    }
    const end = performance.now();

    console.log(`\n---------------------------------------------------`);
    console.log(`Benchmark Results:`);
    console.log(`Total time for ${iterations} iterations: ${(end - start).toFixed(2)}ms`);
    console.log(`Average time per iteration: ${((end - start) / iterations).toFixed(4)}ms`);
    console.log(`---------------------------------------------------\n`);
  });
});
