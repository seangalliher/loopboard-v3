import { describe, expect, it } from 'vitest';
import {
  addCard,
  deleteCard,
  emptyBoard,
  MAX_NOTE_LENGTH,
  MAX_TITLE_LENGTH,
  isOverdue,
  isOverLimit,
  moveCard,
  setWipLimit,
  updateCard,
  type Board,
  type Card,
  type ColumnId,
} from './model';

const ids = (b: Board, col: ColumnId) => b.columns.find((c) => c.id === col)!.cards.map((c) => c.id);

/** todo: a b c, doing: d, done: (empty) */
function sample(): Board {
  let b = emptyBoard();
  for (const id of ['a', 'b', 'c']) b = addCard(b, 'todo', { id, title: id });
  return addCard(b, 'doing', { id: 'd', title: 'd' });
}

describe('emptyBoard', () => {
  it('has three empty columns with no limits', () => {
    const b = emptyBoard();
    expect(b.version).toBe(1);
    expect(b.columns.map((c) => c.id)).toEqual(['todo', 'doing', 'done']);
    expect(b.columns.every((c) => c.cards.length === 0 && c.wipLimit === null)).toBe(true);
  });
});

describe('addCard', () => {
  it('appends a trimmed card with default note and due', () => {
    const b = addCard(emptyBoard(), 'todo', { id: 'x', title: '  Write tests  ' });
    expect(b.columns[0].cards).toEqual([{ id: 'x', title: 'Write tests', note: '', due: null }]);
  });

  it('keeps an optional note and due date', () => {
    const b = addCard(emptyBoard(), 'done', { id: 'x', title: 'T', note: 'n', due: '2026-02-28' });
    expect(b.columns[2].cards[0]).toEqual({ id: 'x', title: 'T', note: 'n', due: '2026-02-28' });
  });

  it('treats an empty due string as no due date', () => {
    const b = addCard(emptyBoard(), 'todo', { id: 'x', title: 'T', due: '' });
    expect(b.columns[0].cards[0].due).toBeNull();
  });

  it('rejects empty and whitespace-only titles', () => {
    const b = emptyBoard();
    expect(addCard(b, 'todo', { id: 'x', title: '' })).toBe(b);
    expect(addCard(b, 'todo', { id: 'x', title: ' \t\n ' })).toBe(b);
  });

  it('rejects malformed or impossible due dates', () => {
    const b = emptyBoard();
    expect(addCard(b, 'todo', { id: 'x', title: 'T', due: '2026-2-1' })).toBe(b);
    expect(addCard(b, 'todo', { id: 'x', title: 'T', due: '2026-02-30' })).toBe(b);
  });

  it('exports the length limits', () => {
    expect(MAX_TITLE_LENGTH).toBe(200);
    expect(MAX_NOTE_LENGTH).toBe(2000);
  });

  it('accepts a title of 200 and a note of 2000, measuring the title after trimming', () => {
    const title = 'a'.repeat(MAX_TITLE_LENGTH);
    const note = 'n'.repeat(MAX_NOTE_LENGTH);
    const b = addCard(emptyBoard(), 'todo', { id: 'x', title: `  ${title}  `, note });
    expect(b.columns[0].cards[0]).toEqual({ id: 'x', title, note, due: null });
  });

  it('rejects a title over 200 or a note over 2000 and returns the same board', () => {
    const b = emptyBoard();
    const long = 'a'.repeat(MAX_TITLE_LENGTH + 1);
    expect(addCard(b, 'todo', { id: 'x', title: long })).toBe(b);
    expect(addCard(b, 'todo', { id: 'x', title: 'T', note: 'n'.repeat(MAX_NOTE_LENGTH + 1) })).toBe(b);
  });

  it('rejects a duplicate id', () => {
    const b = sample();
    expect(addCard(b, 'done', { id: 'a', title: 'again' })).toBe(b);
  });

  it('does not mutate the original board', () => {
    const b = emptyBoard();
    const before = JSON.stringify(b);
    addCard(b, 'todo', { id: 'x', title: 'T' });
    expect(JSON.stringify(b)).toBe(before);
  });
});

describe('updateCard', () => {
  it('changes title (trimmed), note and due', () => {
    const b = updateCard(sample(), 'b', { title: ' New ', note: 'memo', due: '2026-05-01' });
    expect(b.columns[0].cards[1]).toEqual({ id: 'b', title: 'New', note: 'memo', due: '2026-05-01' });
    expect(ids(b, 'todo')).toEqual(['a', 'b', 'c']);
  });

  it('leaves omitted fields alone and can clear the due date', () => {
    let b = updateCard(sample(), 'a', { note: 'memo', due: '2026-05-01' });
    b = updateCard(b, 'a', { due: null });
    expect(b.columns[0].cards[0]).toEqual({ id: 'a', title: 'a', note: 'memo', due: null });
  });

  it('rejects an empty title and changes nothing else either', () => {
    const b = sample();
    expect(updateCard(b, 'a', { title: '   ', note: 'x' })).toBe(b);
  });

  it('accepts a title of 200 and a note of 2000, measuring the title after trimming', () => {
    const title = 'a'.repeat(MAX_TITLE_LENGTH);
    const note = 'n'.repeat(MAX_NOTE_LENGTH);
    const b = updateCard(sample(), 'a', { title: `  ${title}  `, note });
    expect(b.columns[0].cards[0]).toEqual({ id: 'a', title, note, due: null });
  });

  it('rejects a title over 200 and returns the same board', () => {
    const b = sample();
    expect(updateCard(b, 'a', { title: 'a'.repeat(MAX_TITLE_LENGTH + 1) })).toBe(b);
  });

  it('rejects a note over 2000 even with a valid title, leaving the card untouched', () => {
    const b = sample();
    const before = JSON.stringify(b);
    expect(updateCard(b, 'a', { title: 'Renamed', note: 'n'.repeat(MAX_NOTE_LENGTH + 1) })).toBe(b);
    expect(JSON.stringify(b)).toBe(before);
  });

  it('returns the board unchanged for an unknown id or malformed due', () => {
    const b = sample();
    expect(updateCard(b, 'nope', { title: 'x' })).toBe(b);
    expect(updateCard(b, 'a', { due: 'tomorrow' })).toBe(b);
  });
});

describe('deleteCard', () => {
  it('removes the card from its column', () => {
    const b = deleteCard(sample(), 'b');
    expect(ids(b, 'todo')).toEqual(['a', 'c']);
    expect(ids(b, 'doing')).toEqual(['d']);
  });

  it('returns the board unchanged for an unknown id', () => {
    const b = sample();
    expect(deleteCard(b, 'nope')).toBe(b);
  });
});

describe('moveCard', () => {
  it('moves within a column, forward and back', () => {
    expect(ids(moveCard(sample(), 'a', 'todo', 1), 'todo')).toEqual(['b', 'a', 'c']);
    expect(ids(moveCard(sample(), 'c', 'todo', 1), 'todo')).toEqual(['a', 'c', 'b']);
  });

  it('moves across columns to a middle index', () => {
    const b = moveCard(sample(), 'b', 'doing', 0);
    expect(ids(b, 'todo')).toEqual(['a', 'c']);
    expect(ids(b, 'doing')).toEqual(['b', 'd']);
  });

  it('moves to the first and last index', () => {
    expect(ids(moveCard(sample(), 'c', 'todo', 0), 'todo')).toEqual(['c', 'a', 'b']);
    expect(ids(moveCard(sample(), 'a', 'todo', 2), 'todo')).toEqual(['b', 'c', 'a']);
    expect(ids(moveCard(sample(), 'a', 'doing', 1), 'doing')).toEqual(['d', 'a']);
  });

  it('moves into an empty column', () => {
    const b = moveCard(sample(), 'a', 'done', 0);
    expect(ids(b, 'done')).toEqual(['a']);
  });

  it('clamps an out-of-range index', () => {
    expect(ids(moveCard(sample(), 'a', 'todo', 99), 'todo')).toEqual(['b', 'c', 'a']);
    expect(ids(moveCard(sample(), 'c', 'todo', -5), 'todo')).toEqual(['c', 'a', 'b']);
  });

  it('returns the board unchanged for an unknown card', () => {
    const b = sample();
    expect(moveCard(b, 'nope', 'doing', 0)).toBe(b);
  });

  it('returns the board unchanged for a no-op move', () => {
    const b = sample();
    expect(moveCard(b, 'b', 'todo', 1)).toBe(b);
    expect(moveCard(b, 'c', 'todo', 99)).toBe(b);
  });

  it('keeps the card data and does not mutate the original', () => {
    const b = updateCard(sample(), 'a', { note: 'memo', due: '2026-05-01' });
    const before = JSON.stringify(b);
    const moved = moveCard(b, 'a', 'doing', 0);
    expect(moved.columns[1].cards[0]).toEqual({ id: 'a', title: 'a', note: 'memo', due: '2026-05-01' });
    expect(JSON.stringify(b)).toBe(before);
  });

  it('allows moving into a column that is at or over its limit', () => {
    let b = setWipLimit(sample(), 'doing', 1);
    b = moveCard(b, 'a', 'doing', 0);
    expect(ids(b, 'doing')).toEqual(['a', 'd']);
    expect(isOverLimit(b.columns[1])).toBe(true);
  });
});

describe('setWipLimit and isOverLimit', () => {
  it('accepts a positive integer and null', () => {
    let b = setWipLimit(emptyBoard(), 'doing', 3);
    expect(b.columns[1].wipLimit).toBe(3);
    b = setWipLimit(b, 'doing', null);
    expect(b.columns[1].wipLimit).toBeNull();
  });

  it('rejects 0, negatives, non-integers and NaN', () => {
    const b = setWipLimit(emptyBoard(), 'doing', 2);
    for (const bad of [0, -1, 1.5, NaN, Infinity]) {
      expect(setWipLimit(b, 'doing', bad)).toBe(b);
    }
  });

  it('is over the limit only when count is greater than the limit', () => {
    let b = sample(); // todo has 3 cards
    expect(isOverLimit(b.columns[0])).toBe(false); // no limit
    b = setWipLimit(b, 'todo', 4);
    expect(isOverLimit(b.columns[0])).toBe(false);
    b = setWipLimit(b, 'todo', 3);
    expect(isOverLimit(b.columns[0])).toBe(false); // equal is not over
    b = setWipLimit(b, 'todo', 2);
    expect(isOverLimit(b.columns[0])).toBe(true);
  });
});

describe('isOverdue', () => {
  const card = (due: string | null): Card => ({ id: 'x', title: 'x', note: '', due });

  it('is true for a past due date outside Done', () => {
    expect(isOverdue(card('2026-03-09'), 'todo', '2026-03-10')).toBe(true);
    expect(isOverdue(card('2026-03-09'), 'doing', '2026-03-10')).toBe(true);
  });

  it('is false for today, a future date, or no date', () => {
    expect(isOverdue(card('2026-03-10'), 'todo', '2026-03-10')).toBe(false);
    expect(isOverdue(card('2026-03-11'), 'todo', '2026-03-10')).toBe(false);
    expect(isOverdue(card(null), 'todo', '2026-03-10')).toBe(false);
  });

  it('is false in Done even when past due', () => {
    expect(isOverdue(card('2020-01-01'), 'done', '2026-03-10')).toBe(false);
  });

  it("uses a Date's local calendar date", () => {
    const lateEvening = new Date(2026, 2, 10, 23, 59); // local time
    expect(isOverdue(card('2026-03-10'), 'todo', lateEvening)).toBe(false);
    expect(isOverdue(card('2026-03-09'), 'todo', lateEvening)).toBe(true);
  });
});
