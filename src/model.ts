// Pure board logic. No DOM or storage access; every function returns a new
// board, or the same board object when the request is rejected or changes nothing.

export type ColumnId = 'todo' | 'doing' | 'done';

export interface Card {
  id: string;
  title: string;
  note: string;
  /** `YYYY-MM-DD`, or null for no due date. */
  due: string | null;
}

export interface Column {
  id: ColumnId;
  title: string;
  /** Positive integer, or null for no limit. */
  wipLimit: number | null;
  cards: Card[];
}

export interface Board {
  version: 1;
  columns: Column[];
}

/** Fields for a new card. The caller supplies the id, which keeps this module pure. */
export interface NewCard {
  id: string;
  title: string;
  note?: string;
  due?: string | null;
}

export interface CardChanges {
  title?: string;
  note?: string;
  due?: string | null;
}

/** Longest title (after trimming) and note a card may have; longer input is rejected, not truncated. */
export const MAX_TITLE_LENGTH = 200;
export const MAX_NOTE_LENGTH = 2000;

const DUE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function isValidDue(value: string): boolean {
  const m = DUE_PATTERN.exec(value);
  if (!m) return false;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

/** Returns the cleaned due value, or undefined when it is malformed. */
function normaliseDue(due: string | null | undefined): string | null | undefined {
  if (due === undefined || due === null || due === '') return null;
  return isValidDue(due) ? due : undefined;
}

export function emptyBoard(): Board {
  return {
    version: 1,
    columns: [
      { id: 'todo', title: 'To do', wipLimit: null, cards: [] },
      { id: 'doing', title: 'Doing', wipLimit: null, cards: [] },
      { id: 'done', title: 'Done', wipLimit: null, cards: [] },
    ],
  };
}

function mapColumn(board: Board, columnId: ColumnId, fn: (c: Column) => Column): Board {
  return { ...board, columns: board.columns.map((c) => (c.id === columnId ? fn(c) : c)) };
}

function findCard(board: Board, cardId: string): { column: Column; index: number } | null {
  for (const column of board.columns) {
    const index = column.cards.findIndex((c) => c.id === cardId);
    if (index !== -1) return { column, index };
  }
  return null;
}

/**
 * Appends a card to the column. Returns the board unchanged when the title is
 * empty or whitespace-only, the title or note is too long, the due date is
 * malformed, the column is unknown, or the id is already in use.
 */
export function addCard(board: Board, columnId: ColumnId, input: NewCard): Board {
  const title = input.title.trim();
  const due = normaliseDue(input.due);
  if (title === '' || due === undefined) return board;
  if (title.length > MAX_TITLE_LENGTH || (input.note ?? '').length > MAX_NOTE_LENGTH) return board;
  if (!board.columns.some((c) => c.id === columnId)) return board;
  if (findCard(board, input.id)) return board;
  const card: Card = { id: input.id, title, note: input.note ?? '', due };
  return mapColumn(board, columnId, (c) => ({ ...c, cards: [...c.cards, card] }));
}

/**
 * Applies the given fields to a card. Returns the board unchanged for an unknown
 * card, an empty or whitespace-only title, a title or note that is too long, or
 * a malformed due date.
 */
export function updateCard(board: Board, cardId: string, changes: CardChanges): Board {
  const found = findCard(board, cardId);
  if (!found) return board;
  const card = found.column.cards[found.index];
  const next: Card = { ...card };
  if (changes.title !== undefined) {
    const title = changes.title.trim();
    if (title === '' || title.length > MAX_TITLE_LENGTH) return board;
    next.title = title;
  }
  if (changes.note !== undefined) {
    if (changes.note.length > MAX_NOTE_LENGTH) return board;
    next.note = changes.note;
  }
  if (changes.due !== undefined) {
    const due = normaliseDue(changes.due);
    if (due === undefined) return board;
    next.due = due;
  }
  return mapColumn(board, found.column.id, (c) => ({
    ...c,
    cards: c.cards.map((x) => (x.id === cardId ? next : x)),
  }));
}

export function deleteCard(board: Board, cardId: string): Board {
  const found = findCard(board, cardId);
  if (!found) return board;
  return mapColumn(board, found.column.id, (c) => ({
    ...c,
    cards: c.cards.filter((x) => x.id !== cardId),
  }));
}

/**
 * Moves a card to `toIndex` in the destination column. The index is the card's
 * final position in that column and is clamped to 0..length. A full column still
 * accepts the card. Returns the board unchanged for an unknown card or column,
 * or when the card would stay where it is.
 */
export function moveCard(board: Board, cardId: string, toColumn: ColumnId, toIndex: number): Board {
  const found = findCard(board, cardId);
  const dest = board.columns.find((c) => c.id === toColumn);
  if (!found || !dest) return board;
  const card = found.column.cards[found.index];
  // Cards in the destination once the moved card is taken out of it.
  const destCount = dest.cards.length - (dest === found.column ? 1 : 0);
  const wanted = Number.isFinite(toIndex) ? Math.trunc(toIndex) : 0;
  const index = Math.min(Math.max(wanted, 0), destCount);
  if (found.column.id === toColumn && index === found.index) return board;
  return {
    ...board,
    columns: board.columns.map((c) => {
      const cards = c.cards.filter((x) => x.id !== cardId);
      if (c.id === toColumn) cards.splice(index, 0, card);
      return c.id === found.column.id || c.id === toColumn ? { ...c, cards } : c;
    }),
  };
}

/** Sets a positive integer limit, or null for none. Anything else returns the board unchanged. */
export function setWipLimit(board: Board, columnId: ColumnId, limit: number | null): Board {
  if (limit !== null && !(Number.isInteger(limit) && limit > 0)) return board;
  if (!board.columns.some((c) => c.id === columnId)) return board;
  return mapColumn(board, columnId, (c) => ({ ...c, wipLimit: limit }));
}

/** True only when the column has a limit and holds more cards than it. */
export function isOverLimit(column: Column): boolean {
  return column.wipLimit !== null && column.cards.length > column.wipLimit;
}

function localDate(d: Date): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * True when the card has a due date before today and is not in Done.
 * `today` is a `YYYY-MM-DD` string or a Date (its local calendar date is used).
 */
export function isOverdue(card: Card, columnId: ColumnId, today: string | Date): boolean {
  if (card.due === null || columnId === 'done') return false;
  const todayStr = typeof today === 'string' ? today : localDate(today);
  return card.due < todayStr;
}
