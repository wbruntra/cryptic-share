import type { Request, Response, NextFunction } from 'express';
import { COOKIE_SECRET, SESSION_TOKEN } from '../config';

export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  // Check for signed cookie (if using cookie-parser with secret)
  // or just a simple cookie for now.
  // Using 'signedCookies' if cookie-parser is set up with secret.
  const token = req.signedCookies?.admin_token;

  if (token === SESSION_TOKEN) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
};
