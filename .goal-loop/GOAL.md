# Goal: build LoopBoard, a local-first kanban board that runs in the browser.

## Must have

- Three columns (To do, Doing, Done) with add, edit and delete for cards (title, optional note, optional due date).
- Move cards by drag and drop **and** by keyboard (accessible: focus order, ARIA labels, visible focus).
- A work-in-progress limit per column, set by the user; the column warns when it is over the limit.
- Everything persists in `localStorage`; export the board to JSON and import it back.
- Light and dark themes, following the system setting with a manual toggle.
- Works on a phone-width screen.

## Look and feel

LoopBoard should look like a current product, in the spirit of Linear or Trello today, not a form on a page:

- A small design system in plain CSS: custom-property tokens for type (a system UI font stack and a size scale), spacing, colour roles for light and dark, radius and shadow. Cards are soft, rounded surfaces on a quiet board background, not bordered boxes.
- Adding a card: an "Add card" button at the foot of each column opens a compact inline form; Enter saves, Escape cancels, and the form closes again.
- Import and export live in a menu in the header; the native file input is never visible.
- A column's WIP limit is set from that column's menu, not from a number box in every header. The header shows the count against the limit as a badge that turns to a warning colour when over.
- Empty columns show a short hint instead of blank space.
- Short transitions for moving cards and opening forms, turned off under `prefers-reduced-motion`.
- The theme toggle is an icon button in the header.
- At phone width the columns stack or scroll sideways without anything cut off.
- `scripts/visual-setup.mjs` (used by the loop's screenshots) fills the board with a few sample cards, one of them over a WIP limit, so the screenshots show a working board.

## Engineering

- Vite + TypeScript, no UI framework. Relative asset paths (Vite `base: './'`), so the same build works locally and on Pages. `npm run preview` serves the build. Unit tests with Vitest for the board logic; one Playwright smoke test (add a card, move it, reload, it is still there).
- GitHub Actions CI running lint, unit tests and the smoke test on every PR.
- Deploy to GitHub Pages from `main`.

**Not in scope:** accounts, a backend, sync between devices, multiple boards.

**Done when:** every issue is closed, CI is green on `main`, and the board is live on GitHub Pages.
