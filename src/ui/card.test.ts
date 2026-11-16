// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { Card, ColumnId } from '../model';
import { createCard } from './card';

const TODAY = new Date(2030, 5, 15); // 15 June 2030, local time
const make = (over: Partial<Card> = {}): Card => ({ id: 'c1', title: 'Write docs', note: '', due: null, ...over });
const noActions = { onEdit: () => {}, onDelete: () => {} };
const render = (card: Card, column: ColumnId = 'todo') => createCard(card, column, TODAY, noActions);

describe('createCard', () => {
  it('shows the title and tags the card with its id', () => {
    const el = render(make());
    expect(el.dataset.cardId).toBe('c1');
    expect(el.querySelector('.card-title')?.textContent).toBe('Write docs');
    expect(el.tabIndex).toBe(0);
  });

  it('omits the note and due date when there are none', () => {
    const el = render(make());
    expect(el.querySelector('.card-note')).toBeNull();
    expect(el.querySelector('.card-due')).toBeNull();
  });

  it('shows the note and the due date', () => {
    const el = render(make({ note: 'Mention shortcuts', due: '2030-06-20' }));
    expect(el.querySelector('.card-note')?.textContent).toBe('Mention shortcuts');
    expect(el.querySelector('time')?.getAttribute('datetime')).toBe('2030-06-20');
    expect(el.querySelector('.card-due')?.classList.contains('is-overdue')).toBe(false);
  });

  it('inserts user text as text, never as markup', () => {
    const evil = '<img src=x onerror="window.pwned=1">';
    const el = render(make({ title: evil, note: evil }));
    expect(el.querySelector('img')).toBeNull();
    expect(el.querySelector('.card-title')?.textContent).toBe(evil);
    expect(el.querySelector('.card-note')?.textContent).toBe(evil);
  });

  it('marks a past due date overdue, with text for assistive tech', () => {
    const el = render(make({ due: '2030-06-14' }), 'doing');
    expect(el.querySelector('.card-due')?.classList.contains('is-overdue')).toBe(true);
    expect(el.querySelector('.card-due .sr-only')?.textContent).toBe('Overdue: ');
  });

  it('does not mark today overdue', () => {
    const el = render(make({ due: '2030-06-15' }));
    expect(el.querySelector('.is-overdue')).toBeNull();
  });

  it('never marks a card in Done overdue', () => {
    const el = render(make({ due: '2020-01-01' }), 'done');
    expect(el.querySelector('.card-due')).not.toBeNull();
    expect(el.querySelector('.is-overdue')).toBeNull();
    expect(el.querySelector('.sr-only')).toBeNull();
  });

  describe('actions', () => {
    it('has a "…" button labelled with the title, after the card in the tab order', () => {
      const el = render(make({ title: 'Write docs' }));
      document.body.append(el);
      const button = el.querySelector<HTMLButtonElement>('[data-card-menu]') as HTMLButtonElement;
      expect(button.getAttribute('aria-label')).toBe('Card actions: Write docs');
      expect(button.title).toBe('Card actions');
      expect(button.getAttribute('aria-haspopup')).toBe('menu');
      // Hidden only by CSS opacity, so it is a normal tab stop: not disabled, not tabindex -1, not hidden.
      expect(button.disabled).toBe(false);
      expect(button.tabIndex).toBe(0);
      expect(button.closest('[hidden], [aria-hidden="true"]')).toBeNull();
      const stops = [...document.querySelectorAll<HTMLElement>('*')].filter(
        (e) => e.tabIndex >= 0 && !(e as HTMLButtonElement).hidden,
      );
      expect(stops.slice(0, 2)).toEqual([el, button]);
      el.remove();
    });

    it('has a decorative drag handle that is not a control', () => {
      const handle = render(make()).querySelector('.card-handle') as HTMLElement;
      expect(handle.getAttribute('aria-hidden')).toBe('true');
      expect(handle.tagName).toBe('SPAN');
      expect(handle.querySelector('svg')).not.toBeNull();
    });

    it('lists Edit and Delete, and each calls its action with the card id', () => {
      const onEdit = vi.fn();
      const onDelete = vi.fn();
      const el = createCard(make({ id: 'x9' }), 'todo', TODAY, { onEdit, onDelete });
      document.body.append(el);
      el.querySelector<HTMLButtonElement>('[data-card-menu]')?.click();
      const items = [...el.querySelectorAll<HTMLElement>('[role="menuitem"]')];
      expect(items.map((i) => i.textContent)).toEqual(['Edit', 'Delete']);
      items[0].click();
      items[1].click();
      expect(onEdit).toHaveBeenCalledExactlyOnceWith('x9');
      expect(onDelete).toHaveBeenCalledExactlyOnceWith('x9');
      el.remove();
    });

    it('opens the menu upwards only when it would run past the bottom of the column body', () => {
      const body = document.createElement('div');
      body.className = 'column-body';
      const el = render(make());
      body.append(el);
      document.body.append(body);
      const bottom = (n: number) => ({ bottom: n }) as DOMRect;
      const panel = el.querySelector('.menu') as HTMLElement;
      const button = el.querySelector<HTMLButtonElement>('[data-card-menu]') as HTMLButtonElement;
      const spy = vi.spyOn(Element.prototype, 'getBoundingClientRect');
      try {
        spy.mockImplementation(function (this: Element) {
          return this === body ? bottom(100) : bottom(140);
        });
        button.click();
        expect(panel.classList.contains('menu-up')).toBe(true);
        button.click();
        spy.mockImplementation(function (this: Element) {
          return this === body ? bottom(100) : bottom(60);
        });
        button.click();
        expect(panel.classList.contains('menu-up')).toBe(false);
      } finally {
        spy.mockRestore();
        body.remove();
      }
    });
  });
});
