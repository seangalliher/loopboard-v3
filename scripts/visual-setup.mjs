// Setup for .goal-loop/screenshots.mjs: puts a realistic sample board in localStorage so the
// screenshots show cards, an over-limit column and an overdue card. Plain JS because the
// screenshots script imports it directly with Node.

// Same value as STORAGE_KEY in src/storage.ts (a test checks they match).
const STORAGE_KEY = 'loopboard:v1';

/** `YYYY-MM-DD` for `today` (a `YYYY-MM-DD` string) shifted by `days`. */
function shift(today, days) {
  const [y, m, d] = today.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** A board in the storage shape; every due date is relative to `today` (`YYYY-MM-DD`). */
export function buildSeed(today) {
  return {
    version: 1,
    columns: [
      {
        id: 'todo',
        title: 'To do',
        wipLimit: null,
        cards: [
          { id: 'seed-1', title: 'Send the invoice to the printer', note: '', due: shift(today, -3) },
          { id: 'seed-2', title: 'Plan the team offsite', note: 'Shortlist two venues and check the budget first.', due: null },
          { id: 'seed-3', title: 'Renew the domain name', note: '', due: shift(today, 5) },
        ],
      },
      {
        id: 'doing',
        title: 'Doing',
        wipLimit: 2,
        cards: [
          { id: 'seed-4', title: 'Draft the launch announcement', note: '', due: shift(today, 2) },
          { id: 'seed-5', title: 'Fix the login redirect bug', note: '', due: null },
          { id: 'seed-6', title: 'Review the pricing page copy', note: '', due: null },
        ],
      },
      {
        id: 'done',
        title: 'Done',
        wipLimit: null,
        cards: [
          { id: 'seed-7', title: 'Set up the project board', note: '', due: shift(today, -7) },
          { id: 'seed-8', title: 'Book the design review', note: '', due: null },
        ],
      },
    ],
  };
}

function localToday() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Runs on a page that is already loaded: store the seed, then reload so the app reads it. */
export default async function setup(page) {
  const json = JSON.stringify(buildSeed(localToday()));
  await page.evaluate(([key, value]) => globalThis.localStorage.setItem(key, value), [STORAGE_KEY, json]);
  await page.reload({ waitUntil: 'networkidle' });
}
