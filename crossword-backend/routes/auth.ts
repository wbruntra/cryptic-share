import { Router } from 'express'
import { authenticateUser } from '../middleware/auth'
import { AuthService } from '../services/authService'

const router = Router()

router.post('/register', async (req, res) => {
  const { username, password } = req.body

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' })
  }

  try {
    const result = await AuthService.register(username, password)
    res.status(201).json(result)
  } catch (error: any) {
    if (error.message === 'Username already exists') {
      return res.status(400).json({ error: error.message })
    }
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
    const result = await AuthService.login(username, password)
    res.json(result)
  } catch (error: any) {
    if (error.message === 'Invalid credentials') {
      return res.status(401).json({ error: error.message })
    }
    console.error('Login error:', error)
    res.status(500).json({ error: 'Login failed' })
  }
})

router.get('/me', authenticateUser, (req, res) => {
  res.json({ user: res.locals.user })
})

export default router
