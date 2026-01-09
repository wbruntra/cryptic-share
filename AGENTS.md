# AGENTS.md

This document contains guidelines for agentic coding agents working on the Cryptic Share crossword application.

## Project Overview

This is a full-stack crossword puzzle application with:
- **Frontend**: React + TypeScript + Vite + Tailwind CSS
- **Backend**: Express.js + TypeScript + Bun runtime + SQLite/Knex
- **Database**: SQLite with Knex migrations

## Build & Development Commands

### Frontend (crossword-frontend/)
```bash
# Development server
npm run dev

# Build for production
npm run build

# Lint code
npm run lint

# Preview production build
npm run preview
```

### Backend (crossword-backend/)
```bash
# Start development server with hot reload
npm run dev

# Start production server
npm start

# Database migrations
npm run migrate:make <migration-name>
npm run migrate:latest
npm run migrate:rollback
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
  
  return (
    <div className="container">
      {/* JSX content */}
    </div>
  )
}
```

### Backend API Patterns
- Use **Express Router** for route organization
- Implement **async/await** for database operations
- Use **try/catch** blocks for error handling
- Return **consistent JSON responses**

```typescript
router.get('/:id', async (req, res) => {
  const { id } = req.params
  try {
    const result = await db('table').where({ id }).first()
    if (result) {
      res.json(result)
    } else {
      res.status(404).json({ error: 'Not found' })
    }
  } catch (error) {
    console.error('Error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})
```

### Database Patterns
- Use **Knex migrations** for schema changes
- Store JSON data as **stringified JSON** in SQLite
- Use **parameterized queries** (Knex handles this)
- Tests use `beforeEach`/`afterEach` with migrations for isolation

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
├── routes/             # API route handlers
├── middleware/         # Express middleware
├── services/           # Business logic
├── tests/              # Test files (*.test.ts)
├── migrations/         # Database migrations
├── config.ts           # Configuration
└── index.ts            # Server entry point
```

## Security Considerations
- **Never commit** secrets.js or .env files
- Use **admin authentication** for protected routes
- Validate **all input data** on the backend
- Use **parameterized queries** (Knex prevents SQL injection)

## Environment Setup
- **Runtime**: Bun for backend and tests
- **Database**: SQLite (file: ./crossword.db)
- **Frontend proxy**: API calls proxied to localhost:3000

## Code Quality
Run `npm run lint` in the frontend directory before committing changes.
