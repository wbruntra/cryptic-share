import type { Router } from '../http/router'
import { registerAuthRoutes } from './auth'
import { registerPuzzleRoutes } from './puzzles'
import { registerSessionRoutes } from './sessions'
import { registerClueRoutes } from './clues'
import { registerPushRoutes } from './push'
import { registerAdminSessionRoutes } from './admin-sessions'
import { registerAdminExplanationRoutes } from './admin-explanations'

/**
 * Register all API routes for the Bun server
 */
export function registerRoutes(router: Router): void {
  registerAuthRoutes(router)
  registerPuzzleRoutes(router)
  registerSessionRoutes(router)
  registerClueRoutes(router)
  registerPushRoutes(router)
  registerAdminSessionRoutes(router)
  registerAdminExplanationRoutes(router)
}
