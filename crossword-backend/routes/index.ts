import { Express } from 'express'
import puzzlesRouter from './puzzles'
import sessionsRouter from './sessions'
import cluesRouter from './clues'
import authRouter from './auth'
import adminSessionsRouter from './admin-sessions'
import adminExplanationsRouter from './admin-explanations'
import pushRouter from './push'

/**
 * Mount all API routes on the Express app
 */
export function setupRoutes(app: Express): void {
  // Auth and core routes
  app.use('/api/auth', authRouter)
  app.use('/api/puzzles', puzzlesRouter)
  app.use('/api/sessions', sessionsRouter)
  app.use('/api/clues', cluesRouter)

  // Push notification routes
  app.use('/api/push', pushRouter)

  // Admin routes
  app.use('/api/admin/sessions', adminSessionsRouter)
  app.use('/api/admin', adminExplanationsRouter)
}
