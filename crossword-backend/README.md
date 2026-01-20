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

## Batch Explanation Manager

An interactive tool for managing AI-generated clue explanations using OpenAI's batch API.

### Quick Start

```bash
bun run batch-explanations
```

This launches an interactive menu that lets you:

1. **View puzzle explanation status** - See which puzzles have explanations and completion percentage
2. **View recent batch jobs** - Check the status of existing batch jobs
3. **Create new batch job** - Generate explanations for all clues in a puzzle
4. **Check batch status** - Monitor a batch job's progress
5. **Retrieve completed batch results** - Download and save explanations to the database

### Features

- Visual progress bars showing explanation completion for each puzzle
- Real-time batch status monitoring
- Confirmation prompts before creating expensive batch jobs
- Colored emoji indicators for better readability
- Automatic database updates as batches complete

### Legacy CLI (Non-Interactive)

The original command-line interface is still available:

```bash
bun scripts/batch-explanation.ts create <puzzle_id>
bun scripts/batch-explanation.ts check <batch_id>
bun scripts/batch-explanation.ts retrieve <batch_id>
bun scripts/batch-explanation.ts list
```

---

This project was created using `bun init` in bun v1.3.5. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.

