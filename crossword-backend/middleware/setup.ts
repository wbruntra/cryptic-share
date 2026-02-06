import express, { Express } from 'express'
import cookieSession from 'cookie-session'
import morgan from 'morgan'

/**
 * Configure Express middleware: body parser, logging, and session management
 */
export function setupMiddleware(app: Express): void {
  const cookieSecret = process.env.COOKIE_SECRET || 'default_secret'

  // Logging middleware
  app.use(morgan('dev'))

  // Body parser middleware
  app.use(express.json({ limit: '50mb' }))

  // Session middleware
  app.use(
    cookieSession({
      name: 'session',
      keys: [cookieSecret],
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    }),
  )
}
