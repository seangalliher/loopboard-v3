// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addCard, deleteCard, emptyBoard, setWipLimit, type Board } from '../model';
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
    expect(column('doing').querySelector('.add-form')?.hasAttribute('hidden')).toBe(false);
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

/** A stored board with the given titles in To do (ids `t0`, `t1`, ...) and a limit on Doing. */
function seed(todo: string[], doing: string[] = [], doingLimit: number | null = null) {
  let board = emptyBoard();
  todo.forEach((title, i) => (board = addCard(board, 'todo', { id: `t${i}`, title, note: `note ${i}`, due: '2030-02-03' })));
  doing.forEach((title, i) => (board = addCard(board, 'doing', { id: `d${i}`, title })));
  saveBoard(setWipLimit(board, 'doing', doingLimit), storage);
}

const card = (id: string) => q<HTMLElement>(`[data-card-id="${id}"]`);
const stored = () => JSON.parse(data.get(STORAGE_KEY) as string) as Board;
const storedTitles = (id: string) => stored().columns.find((c) => c.id === id)?.cards.map((c) => c.title);
const item = (scope: Element, label: string) =>
  [...scope.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((i) => i.textContent === label) as HTMLButtonElement;

function chooseCardAction(id: string, label: string) {
  card(id).querySelector<HTMLButtonElement>('[data-card-menu]')?.click();
  item(card(id), label).click();
}

const editField = (name: string) => q<HTMLInputElement>(`.card-editing [name="${name}"]`);

describe('card menu', () => {
  it('Edit opens the form prefilled in place of the card; Enter saves title, note and due and persists', () => {
    seed(['one', 'two', 'three']);
    mount();
    chooseCardAction('t1', 'Edit');

    expect(document.querySelector('[data-card-id="t1"]')).toBeNull();
    expect(document.querySelectorAll('.card-editing')).toHaveLength(1);
    const items = [...column('todo').querySelectorAll('.card-list > li')];
    expect(items[1].classList.contains('card-editing')).toBe(true); // same position
    expect([editField('title').value, editField('note').value, editField('due').value]).toEqual([
      'two',
      'note 1',
      '2030-02-03',
    ]);
    expect(document.activeElement).toBe(editField('title'));

    editField('title').value = '  Second  ';
    editField('note').value = 'new note';
    editField('due').value = '2031-04-05';
    key(editField('title'), 'Enter');

    expect(document.querySelector('.card-editing')).toBeNull();
    expect(titles('todo')).toEqual(['one', 'Second', 'three']);
    expect(card('t1').querySelector('.card-note')?.textContent).toBe('new note');
    expect(card('t1').querySelector('time')?.getAttribute('datetime')).toBe('2031-04-05');
    expect(document.activeElement).toBe(card('t1'));
    expect(storedTitles('todo')).toEqual(['one', 'Second', 'three']);
    expect(stored().columns[0].cards[1]).toMatchObject({ note: 'new note', due: '2031-04-05' });
  });

  it('Edit can clear the due date', () => {
    seed(['one']);
    mount();
    chooseCardAction('t0', 'Edit');
    editField('due').value = '';
    key(editField('title'), 'Enter');
    expect(card('t0').querySelector('.card-due')).toBeNull();
    expect(stored().columns[0].cards[0].due).toBeNull();
  });

  it('Escape cancels the edit without changes, restoring the card and its focus', () => {
    seed(['one', 'two']);
    mount();
    const before = data.get(STORAGE_KEY);
    chooseCardAction('t0', 'Edit');
    editField('title').value = 'Changed';
    editField('note').value = 'Changed note';
    key(editField('title'), 'Escape');

    expect(document.querySelector('.card-editing')).toBeNull();
    expect(titles('todo')).toEqual(['one', 'two']);
    expect(card('t0').querySelector('.card-note')?.textContent).toBe('note 0');
    expect(document.activeElement).toBe(card('t0'));
    expect(data.get(STORAGE_KEY)).toBe(before);
  });

  it('refuses an empty title: the form stays open and nothing changes', () => {
    seed(['one']);
    mount();
    const before = data.get(STORAGE_KEY);
    chooseCardAction('t0', 'Edit');
    editField('title').value = '   ';
    key(editField('title'), 'Enter');
    expect(document.querySelectorAll('.card-editing')).toHaveLength(1);
    expect(editField('title').getAttribute('aria-invalid')).toBe('true');
    expect(data.get(STORAGE_KEY)).toBe(before);
  });

  it('keeps the open edit form and its draft when the board changes elsewhere', () => {
    seed(['one', 'two']);
    const store = mount();
    chooseCardAction('t0', 'Edit');
    editField('title').value = 'Half edited';
    store.dispatch((b) => deleteCard(b, 't1'));
    expect(editField('title').value).toBe('Half edited');
    expect(document.activeElement).toBe(editField('title'));
  });

  it('shows the edited text as text, not markup', () => {
    seed(['one']);
    mount();
    chooseCardAction('t0', 'Edit');
    editField('title').value = '<img src=x onerror="window.pwned=1">';
    key(editField('title'), 'Enter');
    expect(card('t0').querySelector('img')).toBeNull();
    expect(titles('todo')).toEqual(['<img src=x onerror="window.pwned=1">']);
  });

  it('Delete removes the card, persists, and focuses the next card', () => {
    seed(['one', 'two', 'three']);
    mount();
    chooseCardAction('t1', 'Delete');
    expect(titles('todo')).toEqual(['one', 'three']);
    expect(storedTitles('todo')).toEqual(['one', 'three']);
    expect(document.activeElement).toBe(card('t2'));
    mount();
    expect(titles('todo')).toEqual(['one', 'three']);
  });

  it('Delete of the last card focuses the previous card, and of the only card the Add card button', () => {
    seed(['one', 'two']);
    mount();
    chooseCardAction('t1', 'Delete');
    expect(document.activeElement).toBe(card('t0'));
    chooseCardAction('t0', 'Delete');
    expect(column('todo').querySelector('.empty-state')).not.toBeNull();
    expect(document.activeElement).toBe(column('todo').querySelector('[data-add-card]'));
    expect(storedTitles('todo')).toEqual([]);
  });

  it('Delete while editing that card closes the form', () => {
    seed(['one', 'two']);
    const store = mount();
    chooseCardAction('t0', 'Edit');
    store.dispatch((b) => deleteCard(b, 't0'));
    expect(document.querySelector('.card-editing')).toBeNull();
    expect(titles('todo')).toEqual(['two']);
  });

  it('closes on Escape and returns focus to its button', () => {
    seed(['one']);
    mount();
    const button = card('t0').querySelector<HTMLButtonElement>('[data-card-menu]') as HTMLButtonElement;
    button.click();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    key(document.activeElement as Element, 'Escape');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(button);
    expect(titles('todo')).toEqual(['one']);
  });

  it('keeps focus on the menu button across a redraw', () => {
    seed(['one', 'two']);
    const store = mount();
    card('t0').querySelector<HTMLButtonElement>('[data-card-menu]')?.focus();
    store.dispatch((b) => deleteCard(b, 't1'));
    expect(document.activeElement).toBe(card('t0').querySelector('[data-card-menu]'));
  });

  it('puts every card, then its menu button, in the tab order', () => {
    seed(['one', 'two']);
    mount();
    const stops = [...root.querySelectorAll<HTMLElement>('*')].filter(
      (e) => e.tabIndex >= 0 && !(e as HTMLButtonElement).hidden && !e.closest('[hidden]'),
    );
    const order = stops.flatMap((e) =>
      e.matches('.card') ? [`card:${e.dataset.cardId}`] : e.matches('[data-card-menu]') ? [`menu:${e.closest<HTMLElement>('.card')?.dataset.cardId}`] : [],
    );
    expect(order).toEqual(['card:t0', 'menu:t0', 'card:t1', 'menu:t1']);
  });
});

describe('WIP limit', () => {
  const badge = (id: string) => column(id).querySelector('.badge') as HTMLElement;
  const warning = (id: string) => column(id).querySelector('.wip-warning');
  const wipInput = (id: string) => column(id).querySelector<HTMLInputElement>('.wip-form input') as HTMLInputElement;
  const openWip = (id: string) => {
    column(id).querySelector<HTMLButtonElement>('[data-column-menu]')?.click();
    item(column(id), 'Set WIP limit…').click();
  };
  const submitWip = (id: string, text: string) => {
    wipInput(id).value = text;
    (column(id).querySelector('.wip-form') as HTMLFormElement).requestSubmit();
  };
  const storedLimit = () => stored().columns.find((c) => c.id === 'doing')?.wipLimit;

  it('has no number box (or any input) in the headers, even with the panel open', () => {
    seed(['one']);
    mount();
    openWip('doing');
    expect(document.querySelector('input[type="number"]')).toBeNull();
    expect(document.querySelector('.column-header input')).toBeNull();
    expect(document.querySelector('.wip-form:not([hidden])')).not.toBeNull();
    expect(column('doing').querySelector('.wip-form')?.closest('header')).toBeNull();
  });

  it('sets a limit from the column menu, persists it, and a remount on the same storage shows it', () => {
    seed(['one'], ['a', 'b']);
    mount();
    expect(badge('doing').firstChild?.textContent).toBe('2');
    openWip('doing');
    expect(document.activeElement).toBe(wipInput('doing'));
    submitWip('doing', '5');
    expect(badge('doing').firstChild?.textContent).toBe('2 / 5');
    expect(column('doing').querySelector('.wip-form')?.hasAttribute('hidden')).toBe(true);
    expect(document.activeElement).toBe(column('doing').querySelector('[data-column-menu]'));
    expect(storedLimit()).toBe(5);

    mount();
    expect(badge('doing').firstChild?.textContent).toBe('2 / 5');
    openWip('doing');
    expect(wipInput('doing').value).toBe('5');
  });

  it('refuses 0, negative, decimal, empty and non-numeric values with a short message and keeps the limit', () => {
    seed(['one'], ['a', 'b'], 4);
    mount();
    openWip('doing');
    for (const text of ['0', '-1', '2.5', '', '   ', 'abc', '1e2']) {
      submitWip('doing', text);
      const error = column('doing').querySelector('.wip-error') as HTMLElement;
      expect(error.hidden, `"${text}"`).toBe(false);
      expect(error.textContent).toBe('Enter a whole number, 1 or more.');
      expect(wipInput('doing').getAttribute('aria-invalid')).toBe('true');
      expect(column('doing').querySelector('.wip-form')?.hasAttribute('hidden')).toBe(false);
      expect(storedLimit()).toBe(4);
      expect(badge('doing').firstChild?.textContent).toBe('2 / 4');
    }
  });

  it('Clear limit removes it and persists', () => {
    seed(['one'], ['a', 'b'], 1);
    mount();
    expect(badge('doing').firstChild?.textContent).toBe('2 / 1');
    openWip('doing');
    column('doing').querySelector<HTMLButtonElement>('[data-clear]')?.click();
    expect(badge('doing').firstChild?.textContent).toBe('2');
    expect(warning('doing')).toBeNull();
    expect(storedLimit()).toBeNull();
    expect(document.activeElement).toBe(column('doing').querySelector('[data-column-menu]'));
  });

  it('Escape closes the panel without changing the limit and returns focus to the menu button', () => {
    seed(['one'], ['a'], 3);
    mount();
    openWip('doing');
    wipInput('doing').value = '9';
    key(wipInput('doing'), 'Escape');
    expect(column('doing').querySelector('.wip-form')?.hasAttribute('hidden')).toBe(true);
    expect(storedLimit()).toBe(3);
    expect(document.activeElement).toBe(column('doing').querySelector('[data-column-menu]'));
  });

  it('closes the column menu on Escape and returns focus to its button', () => {
    seed(['one']);
    mount();
    const button = column('doing').querySelector<HTMLButtonElement>('[data-column-menu]') as HTMLButtonElement;
    button.click();
    key(document.activeElement as Element, 'Escape');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(button);
  });

  it('shows 3 / 2, the warning colour class and a text warning line when over; both go at or below', () => {
    seed(['one'], ['a', 'b', 'c'], 2);
    const store = mount();
    expect(badge('doing').firstChild?.textContent).toBe('3 / 2');
    expect(badge('doing').classList.contains('is-over')).toBe(true);
    expect(warning('doing')?.textContent).toBe('Over the limit: 3 of 2');

    store.dispatch((b) => deleteCard(b, 'd0')); // 2 of 2: at the limit
    expect(badge('doing').firstChild?.textContent).toBe('2 / 2');
    expect(badge('doing').classList.contains('is-over')).toBe(false);
    expect(warning('doing')).toBeNull();

    store.dispatch((b) => deleteCard(b, 'd1')); // 1 of 2: below
    expect(badge('doing').firstChild?.textContent).toBe('1 / 2');
    expect(warning('doing')).toBeNull();
  });

  it('keeps a half-typed limit when the board changes elsewhere', () => {
    seed(['one', 'two']);
    const store = mount();
    openWip('doing');
    wipInput('doing').value = '7';
    const input = wipInput('doing');
    store.dispatch((b) => deleteCard(b, 't0'));
    expect(wipInput('doing')).toBe(input);
    expect(input.value).toBe('7');
    expect(document.activeElement).toBe(input);
  });
});
