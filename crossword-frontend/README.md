# Cryptic Crosswords Frontend

This is a React-based frontend for creating, editing, and playing cryptic crosswords.

## Routes

The application uses React Router for navigation:

- **`/`** (HomePage): Lists all available puzzles. From here you can:
  - **Play** - Start a new playing session for a puzzle
  - **Edit** - Open the grid editor for a puzzle
  
- **`/create`** (PuzzleCreator): Create a new puzzle from scratch
  
- **`/edit/:puzzleId`** (EditPuzzle): Edit an existing puzzle's grid layout
  
- **`/play/:sessionId`** (PlaySession): Play a puzzle and save progress

## Features

- **Grid Editor**: Click cells to toggle between Numbered (N), White (W), and Black (B)
- **Play Mode**: Type letters to fill the grid, use arrow keys to navigate
- **Session Management**: Save and resume puzzle progress via unique session URLs
- **Image Clue Transcription**: Upload an image to automatically transcribe clues using AI

## Development

Install dependencies:

```bash
bun install
```

Run dev server:

```bash
bun run dev
```

Build for production:

```bash
bun run build
```

Preview production build:

```bash
bun run preview
```

## Technology

- **React 19** with TypeScript
- **Vite** for fast development and builds
- **React Router** for client-side routing
- **Axios** for API communication

## Linting

Run linter:

```bash
bun run lint
```

---

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs... 

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

