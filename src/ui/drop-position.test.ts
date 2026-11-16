import { describe, expect, it } from 'vitest';
import { addCard, emptyBoard, moveCard, type Board, type ColumnId } from '../model';
import { findDropTarget, indicatorTop, type ColumnBox, type Rect } from './drop-position';

const rect = (left: number, top: number, right: number, bottom: number): Rect => ({ left, top, right, bottom });

/**
 * Three 320 px columns 16 px apart, 600 px tall, card area from y 50 to 550.
 * A card is 60 px tall with an 8 px gap: tops at 50, 118, 186 (middles 80, 148, 216).
 */
function layout(cards: Record<ColumnId, string[]>): ColumnBox[] {
  return (['todo', 'doing', 'done'] as const).map((id, i) => ({
    id,
    rect: rect(i * 336, 0, i * 336 + 320, 600),
    body: rect(i * 336, 50, i * 336 + 320, 550),
    cards: cards[id].map((cardId, n) => ({ id: cardId, rect: rect(i * 336 + 8, 50 + n * 68, i * 336 + 312, 110 + n * 68) })),
  }));
}

const columns = layout({ todo: ['a', 'b', 'c'], doing: ['d'], done: [] });

describe('findDropTarget', () => {
  it('counts the cards whose middle is above the pointer', () => {
    expect(findDropTarget(100, 60, columns, 'x')).toEqual({ columnId: 'todo', index: 0 });
    expect(findDropTarget(100, 100, columns, 'x')).toEqual({ columnId: 'todo', index: 1 });
    expect(findDropTarget(100, 160, columns, 'x')).toEqual({ columnId: 'todo', index: 2 });
    expect(findDropTarget(100, 300, columns, 'x')).toEqual({ columnId: 'todo', index: 3 });
  });

  it('switches exactly at the middle of a card', () => {
    expect(findDropTarget(100, 79.9, columns, 'x')?.index).toBe(0);
    expect(findDropTarget(100, 80.1, columns, 'x')?.index).toBe(1);
  });

  it('gives index 0 above the first card, in the column header', () => {
    expect(findDropTarget(100, 5, columns, 'x')).toEqual({ columnId: 'todo', index: 0 });
  });

  it('finds the column by x, including the other columns', () => {
    expect(findDropTarget(400, 100, columns, 'x')).toEqual({ columnId: 'doing', index: 1 });
    expect(findDropTarget(700, 100, columns, 'x')).toEqual({ columnId: 'done', index: 0 });
  });

  it('gives index 0 in an empty column wherever the pointer is', () => {
    expect(findDropTarget(700, 590, columns, 'x')).toEqual({ columnId: 'done', index: 0 });
  });

  it('counts the column edges as inside on the left and top, outside on the right and bottom', () => {
    expect(findDropTarget(0, 0, columns, 'x')).not.toBeNull();
    expect(findDropTarget(320, 100, columns, 'x')).toBeNull();
    expect(findDropTarget(100, 600, columns, 'x')).toBeNull();
  });

  it('is null outside every column: in the gap, past the ends, above and below', () => {
    expect(findDropTarget(328, 100, columns, 'x')).toBeNull();
    expect(findDropTarget(-1, 100, columns, 'x')).toBeNull();
    expect(findDropTarget(2000, 100, columns, 'x')).toBeNull();
    expect(findDropTarget(100, -5, columns, 'x')).toBeNull();
    expect(findDropTarget(100, 700, columns, 'x')).toBeNull();
    expect(findDropTarget(100, 100, [], 'x')).toBeNull();
  });

  it('does not count the dragged card, so the index is the final one', () => {
    // Dragging "a" (middle 80) with the pointer just below "b" (middle 148): "b" is the only other card above.
    expect(findDropTarget(100, 150, columns, 'a')).toEqual({ columnId: 'todo', index: 1 });
    // Below everything: the other two cards, not three.
    expect(findDropTarget(100, 400, columns, 'a')).toEqual({ columnId: 'todo', index: 2 });
    // Dragging "a" over its own spot is index 0, the same place.
    expect(findDropTarget(100, 70, columns, 'a')).toEqual({ columnId: 'todo', index: 0 });
  });
});

describe('with moveCard', () => {
  function board(): Board {
    let b = emptyBoard();
    for (const id of ['a', 'b', 'c']) b = addCard(b, 'todo', { id, title: id });
    return addCard(b, 'doing', { id: 'd', title: 'd' });
  }
  const ids = (b: Board, column: ColumnId) => b.columns.find((c) => c.id === column)?.cards.map((c) => c.id);

  function drop(cardId: string, y: number, x = 100): Board {
    const b = board();
    const target = findDropTarget(x, y, columns, cardId);
    if (!target) throw new Error('no target');
    return moveCard(b, cardId, target.columnId, target.index);
  }

  it('moves a card down within its column to where the pointer is', () => {
    expect(ids(drop('a', 300), 'todo')).toEqual(['b', 'c', 'a']);
    expect(ids(drop('a', 160), 'todo')).toEqual(['b', 'a', 'c']);
  });

  it('moves a card up within its column', () => {
    expect(ids(drop('c', 5), 'todo')).toEqual(['c', 'a', 'b']);
    expect(ids(drop('c', 100), 'todo')).toEqual(['a', 'c', 'b']);
  });

  it('is a no-op when the pointer stays near the card: the board is returned unchanged', () => {
    const b = board();
    for (const [id, y] of [['a', 70], ['b', 140], ['b', 100], ['c', 250], ['c', 500]] as const) {
      const target = findDropTarget(100, y, columns, id);
      expect(target).not.toBeNull();
      if (target) expect(moveCard(b, id, target.columnId, target.index)).toBe(b);
    }
  });

  it('moves a card to another column at the pointer, and into an empty column', () => {
    expect(ids(drop('a', 100, 400), 'doing')).toEqual(['d', 'a']);
    expect(ids(drop('a', 60, 400), 'doing')).toEqual(['a', 'd']);
    const into = drop('a', 300, 700);
    expect(ids(into, 'done')).toEqual(['a']);
    expect(ids(into, 'todo')).toEqual(['b', 'c']);
  });
});

describe('indicatorTop', () => {
  const top = (column: ColumnId, index: number, dragged = 'x') => indicatorTop({ columnId: column, index }, columns, dragged);

  it('sits in the gap above the card that will come after, and below the last card', () => {
    expect(top('todo', 1)).toBe(114);
    expect(top('todo', 2)).toBe(182);
    expect(top('todo', 3)).toBe(246 + 4);
  });

  it('sits near the top of the card area for index 0 and in an empty column', () => {
    expect(top('todo', 0)).toBe(50); // 46 clamped to the card area
    expect(top('done', 0)).toBe(54);
  });

  it('skips the dragged card', () => {
    expect(top('todo', 1, 'a')).toBe(182); // "c" is the card after, at its top minus 4
  });

  it('stays inside the visible card area', () => {
    const scrolled = layout({ todo: ['a'], doing: [], done: [] });
    scrolled[0].cards[0].rect = rect(8, 900, 312, 960);
    expect(indicatorTop({ columnId: 'todo', index: 1 }, [scrolled[0]], 'x')).toBe(550);
    scrolled[0].cards[0].rect = rect(8, -200, 312, -140);
    expect(indicatorTop({ columnId: 'todo', index: 0 }, [scrolled[0]], 'x')).toBe(50);
  });
});
