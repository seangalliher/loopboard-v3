// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { addCard, emptyBoard, setWipLimit, type Column } from '../model';
import { createColumn, type ColumnParts } from './column';

const composer = () => {
  const el = document.createElement('div');
  el.className = 'composer';
  return el;
};

const parts = (over: Partial<ColumnParts> = {}): ColumnParts => ({
  composer: composer(),
  wipForm: document.createElement('form'),
  editing: null,
  onSetWipLimit: () => {},
  cardActions: { onEdit: () => {}, onDelete: () => {} },
  ...over,
});

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
    const el = createColumn(column('doing', ['a', 'b']), today, parts());
    expect(el.querySelector('h2')?.textContent).toBe('Doing');
    expect(el.dataset.columnId).toBe('doing');
    expect(el.getAttribute('aria-labelledby')).toBe(el.querySelector('h2')?.id);
    expect(el.querySelector('.badge')?.textContent).toBe('2 cards');
    expect(el.querySelector('.column-dot')).not.toBeNull();
  });

  it('renders one card per item and no empty state', () => {
    const el = createColumn(column('todo', ['a', 'b', 'c']), today, parts());
    expect(el.querySelectorAll('.card')).toHaveLength(3);
    expect(el.querySelector('.empty-state')).toBeNull();
  });

  it('shows an icon and a one-line hint when empty', () => {
    for (const id of ['todo', 'doing', 'done'] as const) {
      const el = createColumn(column(id), today, parts());
      const empty = el.querySelector('.empty-state');
      expect(empty?.querySelector('svg')).not.toBeNull();
      expect(empty?.querySelector('p')?.textContent).not.toBe('');
      expect(el.querySelector('.card')).toBeNull();
      expect(el.querySelector('.badge')?.textContent).toBe('0 cards');
    }
  });

  it('uses the singular for one card', () => {
    expect(createColumn(column('todo', ['a']), today, parts()).querySelector('.badge')?.textContent).toBe('1 card');
  });

  it('puts the composer at the foot', () => {
    const c = composer();
    const el = createColumn(column('todo'), today, parts({ composer: c }));
    expect(el.lastElementChild).toBe(c);
  });

  it('keeps the title of a card as text', () => {
    const el = createColumn(column('todo', ['<b>bold</b>']), today, parts());
    expect(el.querySelector('b')).toBeNull();
    expect(el.querySelector('.card-title')?.textContent).toBe('<b>bold</b>');
  });

  describe('WIP limit display', () => {
    const limited = (titles: string[], limit: number | null) => {
      const board = setWipLimit(
        titles.reduce((b, title, i) => addCard(b, 'doing', { id: `d${i}`, title }), emptyBoard()),
        'doing',
        limit,
      );
      return board.columns.find((c) => c.id === 'doing') as Column;
    };

    it('shows count / limit and a warning line with text when over the limit', () => {
      const el = createColumn(limited(['a', 'b', 'c'], 2), today, parts());
      const badge = el.querySelector('.badge') as HTMLElement;
      expect(badge.firstChild?.textContent).toBe('3 / 2');
      expect(badge.classList.contains('is-over')).toBe(true);
      const warning = el.querySelector('.wip-warning') as HTMLElement;
      expect(warning.textContent).toBe('Over the limit: 3 of 2');
      expect(warning.querySelector('svg')).not.toBeNull();
      expect(el.querySelector('header')?.nextElementSibling).toBe(warning);
    });

    it('shows count / limit without the warning at or below the limit', () => {
      for (const titles of [['a', 'b'], ['a']]) {
        const el = createColumn(limited(titles, 2), today, parts());
        expect(el.querySelector('.badge')?.firstChild?.textContent).toBe(`${titles.length} / 2`);
        expect(el.querySelector('.badge')?.classList.contains('is-over')).toBe(false);
        expect(el.querySelector('.wip-warning')).toBeNull();
      }
    });

    it('shows a plain count and no warning without a limit', () => {
      const el = createColumn(limited(['a', 'b', 'c'], null), today, parts());
      expect(el.querySelector('.badge')?.firstChild?.textContent).toBe('3');
      expect(el.querySelector('.wip-warning')).toBeNull();
    });
  });

  describe('column menu', () => {
    it('has a labelled "…" button in the header and no input in the header', () => {
      const el = createColumn(column('doing'), today, parts());
      const button = el.querySelector<HTMLButtonElement>('header [data-column-menu]') as HTMLButtonElement;
      expect(button.getAttribute('aria-label')).toBe('Column actions: Doing');
      expect(button.getAttribute('aria-haspopup')).toBe('menu');
      expect(el.querySelector('header input, header textarea')).toBeNull();
    });

    it('offers "Set WIP limit…", which calls the action', () => {
      let calls = 0;
      const el = createColumn(column('doing'), today, parts({ onSetWipLimit: () => calls++ }));
      document.body.append(el);
      el.querySelector<HTMLButtonElement>('[data-column-menu]')?.click();
      const items = [...el.querySelectorAll<HTMLElement>('[role="menuitem"]')];
      expect(items.map((i) => i.textContent)).toEqual(['Set WIP limit…']);
      items[0].click();
      expect(calls).toBe(1);
      el.remove();
    });
  });

  it('shows the edit form in place of the card being edited', () => {
    const form = document.createElement('li');
    form.className = 'card-editing';
    const el = createColumn(column('todo', ['a', 'b', 'c']), today, parts({ editing: { cardId: 'todo-1', element: form } }));
    const items = [...el.querySelectorAll('.card-list > li')];
    expect(items).toHaveLength(3);
    expect(items[1]).toBe(form);
    expect(el.querySelector('[data-card-id="todo-1"]')).toBeNull();
  });
});
