import { type Context } from './router'

/**
 * HTTP logging middleware for Bun servers
 * Similar to morgan but for Bun's native fetch handler pattern
 */
export class HttpLogger {
  private startTime: number = 0

  onRequest(method: string, pathname: string): void {
    this.startTime = Date.now()
    // Optionally log on request start (verbose mode)
    // console.log(`[${method}] ${pathname}`)
  }

  onResponse(method: string, pathname: string, status: number): void {
    const duration = Date.now() - this.startTime
    const durationMs = `${duration}ms`.padEnd(6)
    const methodStr = method.padEnd(6)
    const statusStr = `${status}`
    console.log(`[${methodStr}] ${pathname} ${statusStr.padEnd(3)} ${durationMs}`)
  }

  onError(method: string, pathname: string, error: any): void {
    const duration = Date.now() - this.startTime
    const durationMs = `${duration}ms`.padEnd(6)
    const methodStr = method.padEnd(6)
    const statusStr = error.statusCode || '500'
    
    // Get error message - for HttpError check data object first
    let message = 'Unknown error'
    if (error.data && error.data.error) {
      message = error.data.error
    } else if (error.message) {
      message = error.message
    }
    
    console.error(`[${methodStr}] ${pathname} ${statusStr.toString().padEnd(3)} ${durationMs} - ${message}`)
    
    // Log full stack trace for unhandled errors (non-HttpError)
    if (!error.statusCode && error.stack) {
      console.error('Stack trace:')
      console.error(error.stack)
    }
    
    // Log additional error details if available
    if (error.cause) {
      console.error('Caused by:', error.cause)
    }
  }
}

export const httpLogger = new HttpLogger()
