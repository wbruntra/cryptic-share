import express from 'express'
import { setupMiddleware } from './middleware/setup'
import { setupRoutes } from './routes'

const app = express()

// Configure middleware
setupMiddleware(app)

// Mount routes
setupRoutes(app)

export { app }
