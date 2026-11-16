// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addCard, deleteCard, emptyBoard } from '../model';
import { STORAGE_KEY, saveBoard, type StorageLike } from '../storage';
import { createStore, type Store } from '../store';
import { mountBoard } from './board';

let root: HTMLElement;
let data: Map<string, string>;
let failing: boolean;
let storage: StorageLike;

const q = <T extends Element>(selector: string) => document.querySelector(selector) as T;
const column = (id: string) => q<HTMLElement>(`[data-column-id="${id}"]`);
const titles = (id: string) => [...column(id).querySelectorAll('.card-title')].map((e) => e.textContent);
const key = (target: Element, k: string) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

function mount(): Store {
  root = document.createElement('main');
  document.body.replaceChildren(root);
  const store = createStore(storage);
  mountBoard(root, store);
  return store;
}

function addViaForm(columnId: string, text: string) {
  column(columnId).querySelector<HTMLButtonElement>('[data-add-card]')?.click();
  const title = column(columnId).querySelector<HTMLInputElement>('input[name="title"]') as HTMLInputElement;
  title.value = text;
  key(title, 'Enter');
}

beforeEach(() => {
  data = new Map();
  failing = false;
  storage = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      if (failing) throw new Error('quota exceeded');
      data.set(k, v);
    },
  };
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('mountBoard', () => {
  it('shows the three columns with the sample cards on first load', () => {
    mount();
    expect([...document.querySelectorAll('.column-name')].map((e) => e.textContent)).toEqual(['To do', 'Doing', 'Done']);
    expect(document.querySelectorAll('.card')).toHaveLength(3);
    expect(document.querySelector('form:not([hidden])')).toBeNull();
  });

  it('adds a card through the form, and it is still there after a reload', () => {
    mount();
    addViaForm('todo', 'Water the plants');
    expect(titles('todo')).toContain('Water the plants');
    expect(document.activeElement).toBe(column('todo').querySelector('[data-add-card]'));

    mount(); // a new store reads what was saved
    expect(titles('todo')).toContain('Water the plants');
  });

  it('does not add a card for an empty title', () => {
    mount();
    const before = document.querySelectorAll('.card').length;
    addViaForm('doing', '   ');
    expect(document.querySelectorAll('.card')).toHaveLength(before);
    expect(column('doing').querySelector('form')?.hidden).toBe(false);
  });

  it('shows the empty-state hints when the stored board has no cards', () => {
    saveBoard(emptyBoard(), storage);
    mount();
    expect(document.querySelectorAll('.card')).toHaveLength(0);
    expect(document.querySelectorAll('.empty-state')).toHaveLength(3);
    expect(data.has(STORAGE_KEY)).toBe(true);
  });

  it('redraws from the state on every change and restores focus to the same card by id', () => {
    const store = mount();
    const first = column('todo').querySelector<HTMLElement>('.card') as HTMLElement;
    first.focus();
    const id = first.dataset.cardId as string;
    const doingId = column('doing').querySelector<HTMLElement>('.card')?.dataset.cardId as string;

    store.dispatch((b) => deleteCard(b, doingId));

    const again = column('todo').querySelector<HTMLElement>('.card') as HTMLElement;
    expect(again).not.toBe(first);
    expect(again.dataset.cardId).toBe(id);
    expect(document.activeElement).toBe(again);
    expect(column('doing').querySelector('.empty-state')).not.toBeNull();
  });

  it('keeps a half-typed card when the board changes elsewhere', () => {
    const store = mount();
    column('done').querySelector<HTMLButtonElement>('[data-add-card]')?.click();
    const title = column('done').querySelector<HTMLInputElement>('input[name="title"]') as HTMLInputElement;
    title.value = 'Half typed';
    const id = column('todo').querySelector<HTMLElement>('.card')?.dataset.cardId as string;

    store.dispatch((b) => deleteCard(b, id));

    const after = column('done').querySelector<HTMLInputElement>('input[name="title"]') as HTMLInputElement;
    expect(after).toBe(title);
    expect(after.value).toBe('Half typed');
    expect(document.activeElement).toBe(title);
  });

  it('marks a card overdue when the local day changes, keeping a draft and focus, and not redrawing otherwise', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] });
    try {
      vi.setSystemTime(new Date(2026, 5, 15, 23, 59, 50));
      saveBoard(
        addCard(emptyBoard(), 'todo', { id: 'due-15', title: 'Due the 15th', due: '2026-06-15' }),
        storage,
      );
      mount();
      const card = () => column('todo').querySelector<HTMLElement>('[data-card-id="due-15"]') as HTMLElement;
      expect(card().querySelector('.is-overdue') !== null).toBe(false);

      column('done').querySelector<HTMLButtonElement>('[data-add-card]')?.click();
      const title = column('done').querySelector<HTMLInputElement>('input[name="title"]') as HTMLInputElement;
      title.value = 'Half typed';
      title.focus();

      // Same day: a focus check and the passing time must not redraw.
      const before = card();
      window.dispatchEvent(new Event('focus'));
      vi.advanceTimersByTime(5_000);
      expect(card()).toBe(before);

      vi.advanceTimersByTime(10_000); // now 00:00:05 on the 16th
      expect(card()).not.toBe(before);
      expect(card().querySelector('.is-overdue') !== null).toBe(true);
      expect(column('done').querySelector('input[name="title"]')).toBe(title);
      expect(title.value).toBe('Half typed');
      expect(document.activeElement).toBe(title);

      // The next midnight is armed again, and a resume check also catches a missed one.
      const second = card();
      vi.setSystemTime(new Date(2026, 5, 17, 9, 0, 0));
      document.dispatchEvent(new Event('visibilitychange'));
      expect(card()).not.toBe(second);
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows a message, without blocking, when the save fails, and clears it on the next good save', () => {
    mount();
    failing = true;
    addViaForm('todo', 'Unsaved');
    const banner = q<HTMLElement>('.status-banner');
    expect(banner.textContent).toContain('Could not save the board: quota exceeded');
    expect(titles('todo')).toContain('Unsaved'); // still usable in memory

    failing = false;
    addViaForm('todo', 'Saved');
    expect(document.querySelector('.status-banner')).toBeNull();
  });

  it('lets the user dismiss the message', () => {
    mount();
    failing = true;
    addViaForm('todo', 'Unsaved');
    q<HTMLButtonElement>('.status-banner button').click();
    expect(document.querySelector('.status-banner')).toBeNull();
  });
});
