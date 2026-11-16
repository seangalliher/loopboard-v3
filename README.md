# LoopBoard

LoopBoard is a small kanban board that runs entirely in the browser. It has three fixed columns (To do, Doing, Done), saves to `localStorage`, and needs no account or server.

Live: https://seangalliher.github.io/loopboard-v3/

## Features

- Add, edit and delete cards, each with a title, an optional note and an optional due date. Overdue cards are marked.
- Move cards by dragging the handle, with the keyboard (focus a card, press Space, use the arrow keys, press Space to drop), or with "Move to …" in the card's menu.
- Optional work-in-progress (WIP) limit per column; a column over its limit shows a warning but still accepts cards.
- Import and Export in the header menu. Export downloads `loopboard.json`. Import replaces the whole board, asks first when the current board has cards, and shows an error without changing anything when the file is not a valid board (files over 10 MB are refused).
- Light, dark and system themes; works on a phone (columns scroll sideways).

## Run

```sh
npm ci
npm run dev        # development server
npm run build      # type-check and build into dist/
npm run preview    # serve the build
```

## Test

```sh
npm test
```

`npm test` runs lint, the type check, the Vitest unit tests and then the Playwright end-to-end tests (which build the app and serve it on port 4174). The first time, install the browser once:

```sh
npx playwright install chromium
```

`npm run test:e2e` runs only the Playwright tests.

## Project layout

- `src/model.ts`: the board and its pure operations (add, move, edit, delete, WIP limits).
- `src/storage.ts`, `src/store.ts`: saving and loading, JSON export and validated import, and the store the UI reads from.
- `src/ui/`: the board, columns, cards, forms, menus, drag and keyboard handling, and the Import/Export menu.
- `src/main.ts`, `src/styles.css`: the app shell, header and theme, and the Tailwind styles.
- `e2e/`: Playwright tests; `playwright.config.ts` configures them.
- `.github/workflows/`: CI (`npm test`) and the GitHub Pages deploy.

## Data

- The board is stored in `localStorage` under `loopboard:v1`; the theme choice under `loopboard:theme`.
- The export file is the same JSON as the stored board: `{ "version": 1, "columns": [...] }`. The theme is not exported.
