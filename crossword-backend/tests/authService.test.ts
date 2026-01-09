import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import db from '../db-knex'
import { AuthService } from '../services/authService'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { JWT_SECRET } from '../config'

describe('AuthService', () => {
  beforeEach(async () => {
    // Run migrations to ensure schema exists in memory DB
    await db.migrate.latest()
    // Clean up users table
    await db('users').del()
  })

  afterEach(async () => {
    // Rollback migrations
    await db.migrate.rollback()
  })

  describe('register', () => {
    it('should successfully register a new user', async () => {
      const username = 'testuser'
      const password = 'testpassword123'

      const result = await AuthService.register(username, password)

      expect(result).toBeDefined()
      expect(result.token).toBeTypeOf('string')
      expect(result.user).toBeDefined()
      expect(result.user.username).toBe(username)
      expect(result.user.id).toBeTypeOf('number')

      // Verify user was created in database
      const user = await db('users').where({ username }).first()
      expect(user).toBeDefined()
      expect(user.username).toBe(username)
      expect(user.password_hash).not.toBe(password) // Should be hashed

      // Verify password was hashed correctly
      const isValidPassword = await bcrypt.compare(password, user.password_hash)
      expect(isValidPassword).toBe(true)
    })

    it('should generate a valid JWT token on registration', async () => {
      const username = 'jwtuser'
      const password = 'password123'

      const result = await AuthService.register(username, password)

      // Verify the token is valid
      const decoded = jwt.verify(result.token, JWT_SECRET) as any
      expect(decoded.id).toBe(result.user.id)
      expect(decoded.username).toBe(username)
    })

    it('should throw error when username already exists', async () => {
      const username = 'duplicate'
      const password = 'password123'

      // Register first user
      await AuthService.register(username, password)

      // Try to register with same username
      await expect(AuthService.register(username, password)).rejects.toThrow(
        'Username already exists',
      )
    })

    it('should hash different passwords differently', async () => {
      const user1 = await AuthService.register('user1', 'password123')
      const user2 = await AuthService.register('user2', 'password123')

      const dbUser1 = await db('users').where({ id: user1.user.id }).first()
      const dbUser2 = await db('users').where({ id: user2.user.id }).first()

      // Even with same password, hashes should be different (bcrypt uses salts)
      expect(dbUser1.password_hash).not.toBe(dbUser2.password_hash)
    })
  })

  describe('login', () => {
    const testUsername = 'loginuser'
    const testPassword = 'loginpass123'

    beforeEach(async () => {
      // Create a test user before each login test
      await AuthService.register(testUsername, testPassword)
    })

    it('should successfully login with correct credentials', async () => {
      const result = await AuthService.login(testUsername, testPassword)

      expect(result).toBeDefined()
      expect(result.token).toBeTypeOf('string')
      expect(result.user).toBeDefined()
      expect(result.user.username).toBe(testUsername)
      expect(result.user.id).toBeTypeOf('number')
    })

    it('should generate a valid JWT token on login', async () => {
      const result = await AuthService.login(testUsername, testPassword)

      // Verify the token is valid
      const decoded = jwt.verify(result.token, JWT_SECRET) as any
      expect(decoded.id).toBe(result.user.id)
      expect(decoded.username).toBe(testUsername)
    })

    it('should throw error when username does not exist', async () => {
      await expect(AuthService.login('nonexistent', 'password')).rejects.toThrow(
        'Invalid credentials',
      )
    })

    it('should throw error when password is incorrect', async () => {
      await expect(AuthService.login(testUsername, 'wrongpassword')).rejects.toThrow(
        'Invalid credentials',
      )
    })

    it('should return same user id for multiple logins', async () => {
      const result1 = await AuthService.login(testUsername, testPassword)
      const result2 = await AuthService.login(testUsername, testPassword)

      expect(result1.user.id).toBe(result2.user.id)
      expect(result1.user.username).toBe(result2.user.username)
    })

    it('should generate valid tokens for multiple logins', async () => {
      const result1 = await AuthService.login(testUsername, testPassword)
      const result2 = await AuthService.login(testUsername, testPassword)

      // Both tokens should be valid
      const decoded1 = jwt.verify(result1.token, JWT_SECRET) as any
      const decoded2 = jwt.verify(result2.token, JWT_SECRET) as any

      // Both should decode to same user
      expect(decoded1.id).toBe(decoded2.id)
      expect(decoded1.username).toBe(decoded2.username)
    })
  })
})
