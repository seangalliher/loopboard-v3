// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { Card, ColumnId } from '../model';
import { createCard } from './card';

const TODAY = new Date(2030, 5, 15); // 15 June 2030, local time
const make = (over: Partial<Card> = {}): Card => ({ id: 'c1', title: 'Write docs', note: '', due: null, ...over });
const render = (card: Card, column: ColumnId = 'todo') => createCard(card, column, TODAY);

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
});
