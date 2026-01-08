import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import db from '../db-knex'
import { JWT_SECRET } from '../config'
import { authenticateUser } from '../middleware/auth'
import type { AuthRequest } from '../middleware/auth'

const router = Router()

router.post('/register', async (req, res) => {
  const { username, password } = req.body

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' })
  }

  try {
    const existingUser = await db('users').where({ username }).first()
    if (existingUser) {
      return res.status(400).json({ error: 'Username already exists' })
    }

    const hashedPassword = await bcrypt.hash(password, 10)
    const [id] = await db('users').insert({
      username,
      password_hash: hashedPassword,
    })

    const token = jwt.sign({ id, username }, JWT_SECRET, { expiresIn: '7d' })
    res.status(201).json({ token, user: { id, username } })
  } catch (error) {
    console.error('Registration error:', error)
    res.status(500).json({ error: 'Registration failed' })
  }
})

router.post('/login', async (req, res) => {
  const { username, password } = req.body

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' })
  }

  try {
    const user = await db('users').where({ username }).first()
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    const validPassword = await bcrypt.compare(password, user.password_hash)
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, {
      expiresIn: '7d',
    })
    res.json({ token, user: { id: user.id, username: user.username } })
  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json({ error: 'Login failed' })
  }
})

router.get('/me', authenticateUser, (req: AuthRequest, res) => {
  res.json({ user: req.user })
})

export default router
