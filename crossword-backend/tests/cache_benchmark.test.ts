import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import db from '../db-knex'
import { SessionService } from '../services/sessionService'

describe('SessionService Cache Benchmark', () => {
  beforeEach(async () => {
    await db.migrate.latest()
    await db('puzzle_sessions').del()
    await db('puzzles').del()

    // Create a dummy puzzle
    await db('puzzles').insert({
      id: 1,
      title: 'Test Puzzle',
      grid: 'A B\nC D',
      clues: JSON.stringify({ across: [], down: [] }),
    })
  })

  afterEach(async () => {
    await db.migrate.rollback()
  })

  it('should limit cache growth with LRU eviction', async () => {
    const ITERATIONS = 2000;
    const cache = (SessionService as any).cache;

    // Clear cache initially
    cache.clear();

    console.log('Starting benchmark...');
    const initialSize = cache.size;
    console.log(`Initial cache size: ${initialSize}`);

    const startMemory = process.memoryUsage().heapUsed;

    for (let i = 0; i < ITERATIONS; i++) {
      const sessionId = `session-${i}`;

      // Insert session into DB so getSessionState can find it
      await db('puzzle_sessions').insert({
        session_id: sessionId,
        puzzle_id: 1,
        state: '[]',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      // This should load it into cache
      await SessionService.getSessionState(sessionId);

      if (i % 500 === 0) {
        console.log(`Loaded ${i} sessions. Cache size: ${cache.size}`);
      }
    }

    const endMemory = process.memoryUsage().heapUsed;
    const finalSize = cache.size;

    console.log(`Final cache size: ${finalSize}`);
    console.log(`Memory used: ${Math.round((endMemory - startMemory) / 1024 / 1024)} MB`);

    // In the new implementation, cache size should be capped
    // We expect it to be around 900 (threshold) after eviction from 1000
    // But depending on when eviction runs, it might be close to 1000 or 900.
    // Since we add 1 by 1, and evict when hitting 1000 down to 900.
    // So it should be between 900 and 1000.
    expect(finalSize).toBeLessThanOrEqual(1001);
    expect(finalSize).toBeGreaterThan(800);
  });
});
