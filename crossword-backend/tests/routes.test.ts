import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { testClient } from 'hono/testing'
import app from '../hono-app'
import db from '../db-knex'
import { AuthService } from '../services/authService'

// Type the test client
const client = testClient(app)

describe('Auth Routes', () => {
  beforeEach(async () => {
    await db.migrate.latest()
    await db('users').del()
  })

  afterEach(async () => {
    await db.migrate.rollback()
  })

  describe('POST /api/auth/register', () => {
    it('should register a new user', async () => {
      const res = await app.request('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'testuser', password: 'testpass123' }),
      })

      expect(res.status).toBe(200)
      const data = (await res.json()) as any
      expect(data.token).toBeDefined()
      expect(data.user.username).toBe('testuser')
    })

    it('should return 400 for missing fields', async () => {
      const res = await app.request('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'testuser' }),
      })

      expect(res.status).toBe(400)
    })

    it('should return 400 for duplicate username', async () => {
      // Register first user
      await app.request('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'testuser', password: 'testpass123' }),
      })

      // Try to register again
      const res = await app.request('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'testuser', password: 'testpass456' }),
      })

      expect(res.status).toBe(400)
    })
  })

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      await AuthService.register('loginuser', 'password123')
    })

    it('should login with valid credentials', async () => {
      const res = await app.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'loginuser', password: 'password123' }),
      })

      expect(res.status).toBe(200)
      const data = (await res.json()) as any
      expect(data.token).toBeDefined()
    })

    it('should return 401 for invalid password', async () => {
      const res = await app.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'loginuser', password: 'wrongpassword' }),
      })

      expect(res.status).toBe(401)
    })

    it('should return 400 for missing fields', async () => {
      const res = await app.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'loginuser' }),
      })

      expect(res.status).toBe(400)
    })
  })

  describe('GET /api/auth/me', () => {
    it('should return user info with valid token', async () => {
      // Register and get token
      const registerRes = await app.request('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'meuser', password: 'password123' }),
      })
      const { token } = (await registerRes.json()) as any

      // Get user info
      const res = await app.request('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      })

      expect(res.status).toBe(200)
      const data = (await res.json()) as any
      expect(data.user.username).toBe('meuser')
    })

    it('should return 401 without token', async () => {
      const res = await app.request('/api/auth/me')

      expect(res.status).toBe(401)
    })
  })
})

describe('Puzzle Routes', () => {
  beforeEach(async () => {
    await db.migrate.latest()
    await db('puzzle_sessions').del()
    await db('puzzles').del()
    await db('users').del()

    // Create a test puzzle
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

  describe('GET /api/puzzles', () => {
    it('should return list of puzzles', async () => {
      const res = await app.request('/api/puzzles')

      expect(res.status).toBe(200)
      const data = (await res.json()) as any
      expect(Array.isArray(data)).toBe(true)
      expect(data.length).toBeGreaterThan(0)
    })
  })

  describe('GET /api/puzzles/:id', () => {
    it('should return puzzle by id', async () => {
      const res = await app.request('/api/puzzles/1')

      expect(res.status).toBe(200)
      const data = (await res.json()) as any
      expect(data.title).toBe('Test Puzzle')
    })

    it('should return 404 for non-existent puzzle', async () => {
      const res = await app.request('/api/puzzles/999')

      expect(res.status).toBe(404)
    })
  })
})

describe('Clue Routes', () => {
  beforeEach(async () => {
    await db.migrate.latest()
    await db('users').del()
  })

  afterEach(async () => {
    await db.migrate.rollback()
  })

  describe('POST /api/clues/from-image', () => {
    it('should return 401 without token', async () => {
      const res = await app.request('/api/clues/from-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: 'data:image/png;base64,AAA' }),
      })
      expect(res.status).toBe(401)
    })

    it('should return 403 for non-admin user', async () => {
      // Register non-admin
      const regReq = await app.request('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'regular', password: 'password' }),
      })
      const { token } = (await regReq.json()) as any

      const res = await app.request('/api/clues/from-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ image: 'data:image/png;base64,AAA' }),
      })
      expect(res.status).toBe(403)
    })
  })
})

describe('Session Routes', () => {
  beforeEach(async () => {
    await db.migrate.latest()
    await db('puzzle_sessions').del()
    await db('puzzles').del()
    await db('users').del()

    // Create a test puzzle
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

  describe('POST /api/sessions', () => {
    it('should create a new session', async () => {
      const res = await app.request('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ puzzleId: 1, anonymousId: 'anon-123' }),
      })

      expect(res.status).toBe(200)
      const data = (await res.json()) as any
      expect(data.sessionId).toBeDefined()
    })

    it('should return 400 for missing puzzleId', async () => {
      const res = await app.request('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      expect(res.status).toBe(400)
    })
  })

  describe('POST /api/sessions/go', () => {
    it('should get or create a session', async () => {
      const res = await app.request('/api/sessions/go', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ puzzleId: 1, anonymousId: 'anon-456' }),
      })

      expect(res.status).toBe(201) // New session
      const data = (await res.json()) as any
      expect(data.sessionId).toBeDefined()
      expect(data.isNew).toBe(true)
    })

    it('should return existing session on second call', async () => {
      // First call
      await app.request('/api/sessions/go', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ puzzleId: 1, anonymousId: 'anon-789' }),
      })

      // Second call
      const res = await app.request('/api/sessions/go', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ puzzleId: 1, anonymousId: 'anon-789' }),
      })

      expect(res.status).toBe(200) // Existing session
      const data = (await res.json()) as any
      expect(data.isNew).toBe(false)
    })
  })

  describe('GET /api/sessions/:sessionId', () => {
    it('should get session details', async () => {
      // Create session first
      const createRes = await app.request('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ puzzleId: 1, anonymousId: 'anon-get' }),
      })
      const { sessionId } = (await createRes.json()) as any

      // Get session
      const res = await app.request(`/api/sessions/${sessionId}`)

      expect(res.status).toBe(200)
      const data = (await res.json()) as any
      expect(data.title).toBe('Test Puzzle')
    })

    it('should return 404 for non-existent session', async () => {
      const res = await app.request('/api/sessions/nonexistent-id')

      expect(res.status).toBe(404)
    })
  })
})
