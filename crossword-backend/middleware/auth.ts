import type { Request, Response, NextFunction } from 'express'
import { COOKIE_SECRET } from '../config'

export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  // Check for session-based auth
  if (req.session && req.session.isAdmin) {
    next()
  } else {
    res.status(401).json({ error: 'Unauthorized' })
  }
}
