export interface RouteMatch {
  params: Record<string, string>
  handler: Handler
}

export interface Context {
  req: Request
  params: Record<string, string>
  query: URLSearchParams
  body?: any
  user?: AuthUser | null
}

export interface AuthUser {
  id: number | string
  username: string
  isAdmin?: boolean
}

export type Handler = (ctx: Context) => Promise<Response> | Response
export type HeadersInit = Record<string, string> | Headers

interface RouteDefinition {
  method: string
  pattern: RegExp
  keys: string[]
  handler: Handler
}

export class HttpError extends Error {
  statusCode: number
  data: any

  constructor(statusCode: number, data: any = {}) {
    super()
    this.statusCode = statusCode
    this.data = data
  }
}

export class Router {
  private routes: RouteDefinition[] = []

  get(path: string, handler: Handler) {
    this.add('GET', path, handler)
  }

  post(path: string, handler: Handler) {
    this.add('POST', path, handler)
  }

  put(path: string, handler: Handler) {
    this.add('PUT', path, handler)
  }

  delete(path: string, handler: Handler) {
    this.add('DELETE', path, handler)
  }

  add(method: string, path: string, handler: Handler) {
    const { pattern, keys } = compilePath(path)
    this.routes.push({ method, pattern, keys, handler })
  }

  match(method: string, pathname: string): RouteMatch | null {
    for (const route of this.routes) {
      if (route.method !== method) continue
      const match = route.pattern.exec(pathname)
      if (!match) continue
      const params: Record<string, string> = {}
      route.keys.forEach((key, index) => {
        params[key] = decodeURIComponent(match[index + 1] || '')
      })
      return { params, handler: route.handler }
    }
    return null
  }
}

export function jsonResponse(data: any, status = 200, headers?: HeadersInit) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json',
      ...(headers || {}),
    },
  })
}

export function textResponse(text: string, status = 200, headers?: HeadersInit) {
  return new Response(text, {
    status,
    headers: {
      'content-type': 'text/plain',
      ...(headers || {}),
    },
  })
}

function compilePath(path: string) {
  const keys: string[] = []
  const pattern = path
    .split('/')
    .map((segment) => {
      if (segment.startsWith(':')) {
        keys.push(segment.slice(1))
        return '([^/]+)'
      }
      return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    })
    .join('/')
  return { pattern: new RegExp(`^${pattern}$`), keys }
}