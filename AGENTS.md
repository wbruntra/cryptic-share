# AGENTS.md

This document contains guidelines for agentic coding agents working on the Cryptic Share crossword application.

## Project Overview

This is a full-stack crossword puzzle application with:

- **Frontend**: React + TypeScript + Vite + Tailwind CSS
- **Backend**: Bun.serve (native) + TypeScript + SQLite/Knex
- **Database**: SQLite with Knex migrations
- **Authentication**: Unified JWT-based authentication with admin role flag

Use Bun instead of node/npm for all commands, including running scripts and managing dependencies. (Use `bun add` instead of `npm install`)

## Architecture

### Backend Server

The backend uses **native Bun.serve** with a custom HTTP router (no Express):

- **HTTP Router**: Custom lightweight router with path parameter extraction (`/http/router.ts`)
- **SSE**: Server-Sent Events for real-time updates
- **Request Logging**: Custom HTTP logger (`/http/logger.ts`) for request/response timing
- **Body Parsing**: Custom JSON parser in server fetch handler
- **Error Handling**: HttpError exceptions with automatic JSON error responses

### Authentication System

The application uses a **unified JWT-based authentication** system:

- **Single login endpoint**: `/api/auth/login` for both regular users and admins
- **JWT tokens**: Include `{ id, username, isAdmin }` claims
- **No cookies**: Exclusively JWT with Bearer token in Authorization header
- **Admin management**: CLI script to promote/demote users (`bun run scripts/manage-admin.ts`)
- **Database column**: `users.is_admin` boolean column determines admin status
- **Frontend storage**: JWT stored in localStorage via `setAuthToken()`

#### Managing Admin Users

```bash
# List all users with admin status
bun run scripts/manage-admin.ts list

# Promote a user to admin
bun run scripts/manage-admin.ts set <userId>

# Demote an admin to regular user
bun run scripts/manage-admin.ts unset <userId>
```

## Build & Development Commands

### Frontend (crossword-frontend/)

```bash
# Development server
bun run dev

# Build for production
bun run build

# Lint code
bun run lint

# Preview production build
bun run preview
```

### Backend (crossword-backend/)

```bash
# Start development server with hot reload
bun run dev

# Start production server
bun start

# Database migrations
bun run migrate:make <migration-name>
bun run migrate:latest
bun run migrate:rollback
```

## Testing Commands

The backend uses **Bun's built-in test runner**. Tests are located in `crossword-backend/tests/`.

```bash
# Run all tests
cd crossword-backend && bun test

# Run a single test file
bun test tests/sessionService.test.ts

# Run a single test by name (partial match)
bun test "should create a new session"
```

## Code Style Guidelines

### TypeScript & General

- **Strict mode**: Enabled (`"strict": true`)
- **No unused variables**: Enabled (`noUnusedLocals`, `noUnusedParameters`)
- **ES modules**: Use `import`/`export` syntax
- **Target**: ES2022+ for modern features

### Import Organization

```typescript
// 1. React/external libraries
import React from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'

// 2. Internal imports (relative paths)
import { NavBar } from './components/NavBar'
import { HomePage } from './pages/HomePage'
```

### Component Patterns (Frontend)

- Use **function components** with hooks
- Export **named exports** for components: `export function ComponentName()`
- Use **TypeScript interfaces** for props and types
- Follow **camelCase** for variable names
- Use **PascalCase** for component names and types

```typescript
interface ComponentProps {
  title: string
  onAction: (id: number) => void
}

export function ComponentName({ title, onAction }: ComponentProps) {
  const [state, setState] = useState<string>('')

  return <div className="container">{/* JSX content */}</div>
}
```

### Backend API Patterns

- Use **custom Router** for route organization (`/http/router.ts`)
- Implement **async/await** for database operations
- Use **try/catch** blocks for error handling
- Throw **HttpError** exceptions for error responses
- Return responses via **jsonResponse()** helper

```typescript
import { Router, jsonResponse, HttpError, type Context } from '../http/router'
import { requireUser, requireAdmin } from '../middleware/auth'

export function registerRoutes(router: Router) {
  router.get('/api/resource/:id', handleGet)
  router.post('/api/resource', handleCreate)
}

async function handleGet(ctx: Context) {
  const { id } = ctx.params
  requireUser(ctx) // Throws 401 if not authenticated
  
  try {
    const result = await db('table').where({ id }).first()
    if (!result) {
      throw new HttpError(404, { error: 'Not found' })
    }
    return jsonResponse(result)
  } catch (error) {
    if (error instanceof HttpError) throw error
    console.error('Error:', error)
    throw new HttpError(500, { error: 'Internal server error' })
  }
}

async function handleCreate(ctx: Context) {
  requireAdmin(ctx) // Throws 403 if not admin
  const body = ctx.body as any
  // Handle creation...
  return jsonResponse({ success: true })
}
```

### Authentication Middleware

```typescript
import { requireUser, requireAdmin, optionalAuthenticateUser } from '../middleware/auth'

// Throw 401 if no user (any authenticated user)
function handleProtected(ctx: Context) {
  requireUser(ctx)
  // ...
}

// Throw 403 if not admin
function handleAdminOnly(ctx: Context) {
  requireAdmin(ctx)
  // ...
}

// Allow both guests and authenticated users
function handleOptional(ctx: Context) {
  const user = optionalAuthenticateUser(ctx)
  // user is AuthUser | null
}
```

### Database Patterns

- Use **Knex migrations** for schema changes
- Store JSON data as **stringified JSON** in SQLite
- Use **parameterized queries** (Knex handles this)
- Tests use `beforeEach`/`afterEach` with migrations for isolation
- Database schema DDL files are exported to `crossword-backend/tables/` for reference.

### Generating DDL Files

After a new Knex migration, run `bun run scripts/export-table-ddl.ts` from the `crossword-backend` directory to export CREATE TABLE statements for all tables to individual `.sql` files in the `tables/` directory.

### Error Handling

- **Frontend**: Use error boundaries and try/catch for async operations
- **Backend**: Log errors and return appropriate HTTP status codes
- **Validation**: Check required fields and validate input types

### Naming Conventions

- **Files**: kebab-case for folders, PascalCase for React components, camelCase for utilities
- **Variables**: camelCase
- **Constants**: UPPER_SNAKE_CASE
- **Database tables**: snake_case
- **API routes**: kebab-case in URLs, camelCase in code

### CSS/Tailwind Guidelines

- Use **Tailwind utility classes** exclusively
- Prefer **semantic color tokens** (bg-surface, text-primary, etc.)
- Use **responsive prefixes** (sm:, md:, lg:)
- Avoid custom CSS files unless absolutely necessary

### File Structure

```
crossword-frontend/src/
├── components/          # Reusable components
│   ├── mobile/         # Mobile-specific components
├── pages/              # Page-level components
├── utils/              # Utility functions
├── types.ts            # Shared type definitions
└── main.tsx           # App entry point

crossword-backend/
├── http/               # HTTP utilities
│   ├── router.ts      # Custom HTTP router
│   └── logger.ts      # Request/response logger
├── routes/             # API route handlers
├── middleware/         # Auth utility functions
├── services/           # Business logic
├── tests/              # Test files (*.test.ts)
├── migrations/         # Database migrations
├── tables/             # Exported DDL files for reference
├── scripts/            # CLI utilities (admin management, etc.)
├── config.ts           # Configuration
├── bin/                # Executable entry points
│   └── server.ts      # Main server entry point
└── index.ts            # Server entry point (legacy)
```

## Security Considerations

- **Never commit** secrets.js or .env files
- Use **admin authentication** for protected routes
- Validate **all input data** on the backend
- Use **parameterized queries** (Knex prevents SQL injection)

## Environment Setup

- **Runtime**: Bun for backend and tests
- **Database**: SQLite (file: ./crossword.db)
- **Frontend proxy**: API calls proxied to localhost:8921

## Code Quality

Run `bun run lint` in the frontend directory before committing changes.
