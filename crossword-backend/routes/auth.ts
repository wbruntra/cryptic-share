import { Router } from 'express'
import { authenticateUser } from '../middleware/auth'
import { AuthService } from '../services/authService'

const router = Router()

// router.post('/register', async (req, res) => {
//   const { username, password } = req.body

//   if (!username || !password) {
//     return res.status(400).json({ error: 'Username and password are required' })
//   }

//   try {
//     const result = await AuthService.register(username, password)
//     res.status(201).json(result)
//   } catch (error: any) {
//     if (error.message === 'Username already exists') {
//       return res.status(400).json({ error: error.message })
//     }
//     console.error('Registration error:', error)
//     res.status(500).json({ error: 'Registration failed' })
//   }
// })

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

// Admin login via password
router.post('/admin-login', async (req, res) => {
  const { password } = req.body
  if (password === process.env.ADMIN_PASSWORD) {
    req.session = { isAdmin: true }
    res.json({ success: true })
  } else {
    res.status(401).json({ error: 'Invalid password' })
  }
})

// Check admin authentication status
router.get('/check-auth', (req, res) => {
  if (req.session?.isAdmin) {
    res.json({ authenticated: true })
  } else {
    res.status(401).json({ authenticated: false })
  }
})

export default router
