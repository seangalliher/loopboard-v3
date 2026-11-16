// Saving, loading, export and import of the board. Imported text is only ever
// parsed as JSON and checked field by field; it is never evaluated, and every
// value that comes out is a plain string, number or null.

import {
  addCard,
  emptyBoard,
  isValidDue,
  MAX_NOTE_LENGTH,
  MAX_TITLE_LENGTH,
  type Board,
  type Card,
  type Column,
  type ColumnId,
} from './model';

export const STORAGE_KEY = 'loopboard:v1';

/** The part of `Storage` used here, so tests can pass a fake. */
export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export type ParseResult = { ok: true; board: Board } | { ok: false; error: string };
export type SaveResult = { ok: true } | { ok: false; error: string };

const COLUMN_IDS: readonly string[] = ['todo', 'doing', 'done'];

/** A new board with one sample card in each column. */
export function sampleBoard(): Board {
  let board = emptyBoard();
  board = addCard(board, 'todo', {
    id: 'sample-1',
    title: 'Add your own cards',
    note: 'Use the add button on a column.',
  });
  board = addCard(board, 'doing', { id: 'sample-2', title: 'Drag a card to another column' });
  board = addCard(board, 'done', { id: 'sample-3', title: 'Open Loopboard' });
  return board;
}

/** Defaults to `localStorage`; reading it can throw when access is denied. */
function resolveStorage(storage?: StorageLike): StorageLike {
  return storage ?? localStorage;
}

function describeError(e: unknown): string {
  return e instanceof Error && e.message ? e.message : 'unknown error';
}

/**
 * Returns the stored board. Missing, unreadable or invalid stored data gives
 * the sample board; stored data that parses, even with no cards, is kept.
 */
export function loadBoard(storage?: StorageLike): Board {
  try {
    const raw = resolveStorage(storage).getItem(STORAGE_KEY);
    if (raw === null) return sampleBoard();
    const result = parseBoard(raw);
    return result.ok ? result.board : sampleBoard();
  } catch {
    return sampleBoard();
  }
}

/** Never throws; a quota or access failure comes back as `{ ok: false, error }`. */
export function saveBoard(board: Board, storage?: StorageLike): SaveResult {
  try {
    resolveStorage(storage).setItem(STORAGE_KEY, exportJson(board));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: `Could not save the board: ${describeError(e)}` };
  }
}

export function exportJson(board: Board): string {
  return JSON.stringify(board, null, 2);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

type Checked<T> = { value: T } | { error: string };

function checkString(value: unknown, path: string, max: number, required: boolean): Checked<string> {
  if (typeof value !== 'string') return { error: `${path} must be a string` };
  if (required && value.trim() === '') return { error: `${path} must not be empty` };
  if (value.length > max) return { error: `${path} is longer than ${max} characters` };
  return { value };
}

function checkCard(value: unknown, path: string, seenIds: Set<string>): Checked<Card> {
  if (!isRecord(value)) return { error: `${path} must be an object` };
  // Card ids are any string, unique (the model's contract); title limits do not apply.
  if (typeof value.id !== 'string') return { error: `${path}.id must be a string` };
  const id = { value: value.id };
  if (seenIds.has(id.value)) return { error: `${path}.id "${id.value}" is a duplicate card id` };
  seenIds.add(id.value);
  const title = checkString(value.title, `${path}.title`, MAX_TITLE_LENGTH, true);
  if ('error' in title) return title;
  const note = checkString(value.note, `${path}.note`, MAX_NOTE_LENGTH, false);
  if ('error' in note) return note;
  const due = value.due;
  if (due !== null && !(typeof due === 'string' && isValidDue(due))) {
    return { error: `${path}.due must be a real YYYY-MM-DD date or null` };
  }
  return { value: { id: id.value, title: title.value, note: note.value, due } };
}

function checkColumn(value: unknown, path: string, seenIds: Set<string>): Checked<Column> {
  if (!isRecord(value)) return { error: `${path} must be an object` };
  const id = value.id;
  if (typeof id !== 'string' || !COLUMN_IDS.includes(id)) {
    return { error: `${path}.id must be one of ${COLUMN_IDS.join(', ')}` };
  }
  const title = checkString(value.title, `${path}.title`, MAX_TITLE_LENGTH, false);
  if ('error' in title) return title;
  const wip = value.wipLimit;
  if (wip !== null && !(typeof wip === 'number' && Number.isInteger(wip) && wip > 0)) {
    return { error: `${path}.wipLimit must be a positive whole number or null` };
  }
  if (!Array.isArray(value.cards)) return { error: `${path}.cards must be an array` };
  const cards: Card[] = [];
  for (let i = 0; i < value.cards.length; i++) {
    const card = checkCard(value.cards[i], `${path}.cards[${i}]`, seenIds);
    if ('error' in card) return card;
    cards.push(card.value);
  }
  return { value: { id: id as ColumnId, title: title.value, wipLimit: wip, cards } };
}

/**
 * Validates a board. Accepts JSON text (as exported or stored) or an already
 * parsed value. Never throws. Fields it does not know are dropped.
 */
export function parseBoard(input: unknown): ParseResult {
  let data = input;
  if (typeof input === 'string') {
    try {
      data = JSON.parse(input);
    } catch {
      return { ok: false, error: 'The text is not valid JSON' };
    }
  }
  if (!isRecord(data)) return { ok: false, error: 'The board must be a JSON object' };
  if (data.version !== 1) return { ok: false, error: 'Unsupported version: expected version 1' };
  if (!Array.isArray(data.columns)) return { ok: false, error: 'columns must be an array' };

  const columns: Column[] = [];
  const seenColumns = new Set<string>();
  const seenCards = new Set<string>();
  for (let i = 0; i < data.columns.length; i++) {
    const column = checkColumn(data.columns[i], `columns[${i}]`, seenCards);
    if ('error' in column) return { ok: false, error: column.error };
    if (seenColumns.has(column.value.id)) {
      return { ok: false, error: `Duplicate column id "${column.value.id}"` };
    }
    seenColumns.add(column.value.id);
    columns.push(column.value);
  }
  const missing = COLUMN_IDS.filter((id) => !seenColumns.has(id));
  if (missing.length > 0) return { ok: false, error: `Missing column id: ${missing.join(', ')}` };
  return { ok: true, board: { version: 1, columns } };
}
