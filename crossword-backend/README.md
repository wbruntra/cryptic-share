# crossword-backend

To install dependencies:

```bash
bun install
```

To run:

```bash
bun start
```

Or for development with hot reload:

```bash
bun run dev
```

## Database Management with Knex

This project uses Knex.js for database migrations and management.

### Setup

Run migrations to create the database schema:

```bash
bun run migrate:latest
```

### Database Schema

The database contains two tables:

- **puzzles**: Stores crossword puzzles (id, title, grid, clues)
- **puzzle_sessions**: Stores user progress for playing puzzles (session_id, puzzle_id, state)

### Migration Commands

- `bun run migrate:make <name>`: Create a new migration file
- `bun run migrate:latest`: Run all pending migrations
- `bun run migrate:rollback`: Rollback the latest migration

### Backup & Restore

To backup the database:

```bash
bun run backup.ts
```
This creates `backup_data.json` with all puzzles and sessions.

To restore from backup:

```bash
bun run restore.ts
```

---

This project was created using `bun init` in bun v1.3.5. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
