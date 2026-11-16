// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import setup, { buildSeed } from '../scripts/visual-setup.mjs';
import { isOverdue, isOverLimit } from './model';
import { parseBoard, STORAGE_KEY } from './storage';

function parsed(today: string) {
  const result = parseBoard(buildSeed(today));
  if (!result.ok) throw new Error(result.error);
  return result.board;
}

describe('buildSeed', () => {
  it('passes parseBoard with a few cards in every column', () => {
    const board = parsed('2026-11-15');
    for (const column of board.columns) expect(column.cards.length).toBeGreaterThanOrEqual(2);
  });

  it('has a Doing column over its limit', () => {
    const doing = parsed('2026-11-15').columns.find((c) => c.id === 'doing');
    expect(doing?.wipLimit).toBe(2);
    expect(doing && isOverLimit(doing)).toBe(true);
  });

  it('has exactly one overdue card, and it is outside Done', () => {
    const today = '2026-11-15';
    const overdue = parsed(today).columns.flatMap((c) =>
      c.cards.filter((card) => isOverdue(card, c.id, today)).map((card) => ({ column: c.id, card })),
    );
    expect(overdue).toHaveLength(1);
    expect(overdue[0].column).not.toBe('done');
  });

  it('has a card with a note and a card due after today', () => {
    const cards = parsed('2026-11-15').columns.flatMap((c) => c.cards);
    expect(cards.some((c) => c.note !== '')).toBe(true);
    expect(cards.some((c) => c.due !== null && c.due > '2026-11-15')).toBe(true);
  });

  it('keeps due dates relative to today, across month and year ends', () => {
    for (const today of ['2026-11-15', '2027-01-02', '2028-03-01']) {
      const board = parsed(today);
      const overdue = board.columns.flatMap((c) => c.cards.filter((card) => isOverdue(card, c.id, today)));
      expect(overdue).toHaveLength(1);
    }
    const dues = (today: string) => parsed(today).columns.flatMap((c) => c.cards.map((card) => card.due));
    expect(dues('2026-11-15')).not.toEqual(dues('2027-01-02'));
  });
});

describe('default export', () => {
  afterEach(() => localStorage.clear());

  it('stores a valid seed under the storage key, then reloads and waits for networkidle', async () => {
    const calls: string[] = [];
    const page = {
      evaluate: vi.fn(async (fn: (arg: [string, string]) => void, arg: [string, string]) => {
        calls.push('evaluate');
        fn(arg);
      }),
      reload: vi.fn(async () => {
        calls.push('reload');
      }),
    };
    await setup(page);
    const stored = localStorage.getItem(STORAGE_KEY);
    expect(stored).not.toBeNull();
    expect(parseBoard(stored).ok).toBe(true);
    expect(page.reload).toHaveBeenCalledWith({ waitUntil: 'networkidle' });
    expect(calls).toEqual(['evaluate', 'reload']);
  });
});
