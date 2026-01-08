import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { COOKIE_SECRET, JWT_SECRET } from '../config'

export interface AuthRequest extends Request {
  user?: {
    id: number;
    username: string;
  }
}

export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  // Check for session-based auth
  if (req.session && req.session.isAdmin) {
    next()
  } else {
    res.status(401).json({ error: 'Unauthorized' })
  }
}

export const authenticateUser = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]

  if (!token) return res.status(401).json({ error: 'No token provided' })

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) return res.status(403).json({ error: 'Invalid token' })
    req.user = user
    next()
  })
}

export const optionalAuthenticateUser = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]

  if (!token) {
    return next()
  }

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (!err) {
      req.user = user
    }
    next()
  })
}
