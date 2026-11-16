// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { addCard, emptyBoard, type Column } from '../model';
import { createColumn } from './column';

const composer = () => {
  const el = document.createElement('div');
  el.className = 'composer';
  return el;
};

function column(id: 'todo' | 'doing' | 'done', titles: string[] = []): Column {
  let board = emptyBoard();
  titles.forEach((title, i) => {
    board = addCard(board, id, { id: `${id}-${i}`, title });
  });
  return board.columns.find((c) => c.id === id) as Column;
}

const today = new Date(2030, 5, 15);

describe('createColumn', () => {
  it('has its name as the heading, a count badge and an accent hook', () => {
    const el = createColumn(column('doing', ['a', 'b']), today, composer());
    expect(el.querySelector('h2')?.textContent).toBe('Doing');
    expect(el.dataset.columnId).toBe('doing');
    expect(el.getAttribute('aria-labelledby')).toBe(el.querySelector('h2')?.id);
    expect(el.querySelector('.badge')?.textContent).toBe('2 cards');
    expect(el.querySelector('.column-dot')).not.toBeNull();
  });

  it('renders one card per item and no empty state', () => {
    const el = createColumn(column('todo', ['a', 'b', 'c']), today, composer());
    expect(el.querySelectorAll('.card')).toHaveLength(3);
    expect(el.querySelector('.empty-state')).toBeNull();
  });

  it('shows an icon and a one-line hint when empty', () => {
    for (const id of ['todo', 'doing', 'done'] as const) {
      const el = createColumn(column(id), today, composer());
      const empty = el.querySelector('.empty-state');
      expect(empty?.querySelector('svg')).not.toBeNull();
      expect(empty?.querySelector('p')?.textContent).not.toBe('');
      expect(el.querySelector('.card')).toBeNull();
      expect(el.querySelector('.badge')?.textContent).toBe('0 cards');
    }
  });

  it('uses the singular for one card', () => {
    expect(createColumn(column('todo', ['a']), today, composer()).querySelector('.badge')?.textContent).toBe('1 card');
  });

  it('puts the composer at the foot', () => {
    const c = composer();
    const el = createColumn(column('todo'), today, c);
    expect(el.lastElementChild).toBe(c);
  });

  it('keeps the title of a card as text', () => {
    const el = createColumn(column('todo', ['<b>bold</b>']), today, composer());
    expect(el.querySelector('b')).toBeNull();
    expect(el.querySelector('.card-title')?.textContent).toBe('<b>bold</b>');
  });
});
