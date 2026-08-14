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

## Adding New Puzzles

Puzzles come from photographed/scanned book pages, transcribed by an AI vision
model. It's a two-step pipeline: transcribe answers first (creates the
puzzles + grids), then transcribe clues (fills them in and publishes).
Both steps need `pdftoppm` (`sudo apt-get install poppler-utils`) to split
PDF pages into images, and either `OPENAI_API_KEY` (default) or
`OPENROUTER_API_KEY` (with `--openrouter`, uses Google Gemini Flash) set in
the environment.

### 1. Transcribe answers → creates the puzzles

```bash
bun run scripts/transcribe-answers-from-pdf.ts <answers.pdf> --book <n>
```

- Name the PDF `<anything>_<start>.pdf` (e.g. `solutions_105.pdf` → page 1 is
  puzzles 105-108, page 2 is 109-112, ...); each page covers 4 puzzles. Override
  with `--start <n>` if needed.
- Constructs each puzzle's grid automatically from the answer lengths/numbering
  (pass a pre-built grids JSON instead if you have one).
- Creates puzzles **unpublished**, with placeholder `[CLUE PENDING]` clues -
  they won't show up for players until clues are added in step 2.
- Add `--openrouter` to transcribe via Google Gemini Flash on OpenRouter
  instead of the OpenAI default.
- `--dry-run` to preview without touching the DB, `--update-existing` to
  overwrite puzzles that already exist for that book/number.
- Full options: `bun run scripts/transcribe-answers-from-pdf.ts --help`

### 2. Transcribe clues → fills them in and publishes

```bash
bun run scripts/transcribe-clues-from-pdf.ts <clues.pdf> --book <n>
```

- Name the PDF `<anything>_<start>_<end>.pdf` (e.g. `clues_97_100.pdf` starts
  at puzzle 97, one page per puzzle).
- Looks up each puzzle by `book` + `puzzle_number` (must already exist from
  step 1), replaces the placeholder clues, and marks the puzzle
  `is_published=true` so it appears on the home page. Pass `--no-publish` to
  skip that.
- Same `--openrouter`, `--dry-run`, `--help` options as step 1.

### Starting a new book

Puzzle numbers restart at 1 for each book, so just pass a new `--book <n>` in
both steps (e.g. `--book 4`) - the DB enforces one puzzle per
`(book, puzzle_number)` pair, so a typo'd book number will fail loudly
instead of silently colliding with an existing puzzle.

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

