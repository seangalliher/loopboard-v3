// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addCard, deleteCard, emptyBoard, moveCard, setWipLimit, updateCard, type Board } from '../model';
import { STORAGE_KEY, exportJson, saveBoard, type StorageLike } from '../storage';
import { createStore, type Store } from '../store';
import { mountBoard } from './board';
import { importText } from './data-menu';

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

  it('an import that replaces the card being edited closes the form and shows the imported card', () => {
    seed(['one', 'two']);
    const store = mount();
    chooseCardAction('t0', 'Edit');
    editField('title').value = 'Unsaved edit';
    const imported = addCard(emptyBoard(), 'todo', { id: 't0', title: 'Imported replacement' });
    expect(importText(exportJson(imported), store, () => true)).toEqual({ status: 'imported' });
    expect(document.querySelector('.card-editing')).toBeNull();
    expect(titles('todo')).toEqual(['Imported replacement']);
    expect(storedTitles('todo')).toEqual(['Imported replacement']);
  });

  it('keeps the form and draft when the edited card is moved or another card changes', () => {
    seed(['one', 'two', 'three']);
    const store = mount();
    chooseCardAction('t0', 'Edit');
    editField('title').value = 'Half edited';
    store.dispatch((b) => updateCard(b, 't1', { title: 'two changed' }));
    store.dispatch((b) => moveCard(b, 't2', 'doing', 0));
    store.dispatch((b) => moveCard(b, 't0', 'done', 0)); // same card object, new place
    expect(editField('title').value).toBe('Half edited');
    expect(column('done').querySelector('.card-editing')).not.toBeNull();
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

describe('keyboard moves', () => {
  const live = () => q<HTMLElement>('[aria-live="polite"]').textContent;
  const press = (target: Element, k: string, init: KeyboardEventInit = {}) =>
    target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }));
  const grab = (id: string) => {
    card(id).focus();
    press(card(id), ' ');
  };
  const order = (id: string) => [...column(id).querySelectorAll<HTMLElement>('[data-card-id]')].map((e) => e.dataset.cardId);
  const settle = () => new Promise((resolve) => setTimeout(resolve)); // focusout is handled in a later task

  it('Space grabs the focused card: a data attribute and class mark it, focus stays, the live region says so', () => {
    seed(['one', 'two', 'three'], ['four']);
    mount();
    grab('t1');
    expect(card('t1').dataset.grabbed).toBe('');
    expect(card('t1').classList.contains('is-grabbed')).toBe(true);
    expect(document.activeElement).toBe(card('t1'));
    expect(live()).toBe(
      'Grabbed two. Currently in To do, position 2 of 3. Use arrow keys to move, Space to drop, Escape to cancel',
    );
  });

  it('shows each move in place, announces it and saves nothing until the drop', () => {
    seed(['one', 'two', 'three'], ['four']);
    const store = mount();
    const saved = data.get(STORAGE_KEY);
    const board = store.getState();
    grab('t1');

    press(card('t1'), 'ArrowRight');
    expect(order('doing')).toEqual(['d0', 't1']);
    expect(order('todo')).toEqual(['t0', 't2']);
    expect(live()).toBe('two moved to Doing, position 2 of 2');
    expect(document.activeElement).toBe(card('t1'));
    expect(card('t1').dataset.grabbed).toBe('');
    expect(column('doing').querySelector('.badge')?.textContent).toBe('2 cards');

    press(card('t1'), 'ArrowUp');
    expect(order('doing')).toEqual(['t1', 'd0']);
    expect(live()).toBe('two moved to Doing, position 1 of 2');
    press(card('t1'), 'ArrowRight');
    expect(column('done').querySelector('.empty-state')).toBeNull();
    expect(order('done')).toEqual(['t1']);
    expect(live()).toBe('two moved to Done, position 1 of 1');
    press(card('t1'), 'ArrowLeft');
    press(card('t1'), 'ArrowDown');
    expect(order('doing')).toEqual(['d0', 't1']);

    expect(store.getState()).toBe(board);
    expect(data.get(STORAGE_KEY)).toBe(saved);
    expect(document.activeElement).toBe(card('t1'));
  });

  it('stops at the edges: no move, nothing announced', () => {
    seed(['one', 'two']);
    mount();
    grab('t0');
    const announced = live();
    press(card('t0'), 'ArrowUp');
    press(card('t0'), 'ArrowLeft');
    expect(order('todo')).toEqual(['t0', 't1']);
    expect(live()).toBe(announced);
  });

  it.each([' ', 'Enter'])('%j drops the card, saves the move once and keeps focus on it', (dropKey) => {
    seed(['one', 'two', 'three']);
    const store = mount();
    let saves = 0;
    store.subscribe(() => saves++);
    grab('t0');
    press(card('t0'), 'ArrowRight');
    press(card('t0'), 'ArrowRight');
    expect(saves).toBe(0);
    press(card('t0'), dropKey);

    expect(saves).toBe(1);
    expect(storedTitles('done')).toEqual(['one']);
    expect(storedTitles('todo')).toEqual(['two', 'three']);
    expect(card('t0').hasAttribute('data-grabbed')).toBe(false);
    expect(card('t0').classList.contains('is-grabbed')).toBe(false);
    expect(document.activeElement).toBe(card('t0'));
    expect(live()).toBe('Dropped one in Done, position 1 of 1');
    mount();
    expect(titles('done')).toEqual(['one']);
  });

  it('dropping where it started saves nothing', () => {
    seed(['one', 'two']);
    mount();
    const saved = data.get(STORAGE_KEY);
    grab('t0');
    press(card('t0'), 'ArrowDown');
    press(card('t0'), 'ArrowUp');
    press(card('t0'), ' ');
    expect(data.get(STORAGE_KEY)).toBe(saved);
    expect(live()).toBe('Dropped one in To do, position 1 of 2');
  });

  it('Escape puts the card back where it was, saves nothing and keeps focus on it', () => {
    seed(['one', 'two', 'three'], ['four']);
    const store = mount();
    const saved = data.get(STORAGE_KEY);
    const board = store.getState();
    grab('t1');
    press(card('t1'), 'ArrowRight');
    press(card('t1'), 'ArrowDown');
    press(card('t1'), 'Escape');

    expect(order('todo')).toEqual(['t0', 't1', 't2']);
    expect(order('doing')).toEqual(['d0']);
    expect(card('t1').hasAttribute('data-grabbed')).toBe(false);
    expect(document.activeElement).toBe(card('t1'));
    expect(store.getState()).toBe(board);
    expect(data.get(STORAGE_KEY)).toBe(saved);
    expect(live()).toBe('Move cancelled. two is back in To do, position 2 of 3');
    press(card('t1'), 'ArrowRight'); // no longer grabbed: the arrow does nothing
    expect(order('todo')).toEqual(['t0', 't1', 't2']);
  });

  it('Tab (focus leaving the card) cancels the grab and the card goes back', async () => {
    seed(['one', 'two'], ['four']);
    mount();
    grab('t0');
    press(card('t0'), 'ArrowRight');
    card('t0').querySelector<HTMLElement>('[data-card-menu]')?.focus();
    await settle();
    expect(order('todo')).toEqual(['t0', 't1']);
    expect(card('t0').hasAttribute('data-grabbed')).toBe(false);
    expect(storedTitles('doing')).toEqual(['four']);
    expect(live()).toMatch(/^Move cancelled/);
    expect(document.activeElement).toBe(card('t0').querySelector('[data-card-menu]'));
  });

  it('does not cancel while the redraws of its own moves replace the card', async () => {
    seed(['one', 'two'], ['four']);
    mount();
    grab('t0');
    press(card('t0'), 'ArrowRight');
    press(card('t0'), 'ArrowRight');
    await settle();
    expect(card('t0').dataset.grabbed).toBe('');
    expect(order('done')).toEqual(['t0']);
  });

  it('only a keypress on the card itself grabs: not its menu button, an open menu or a form field', () => {
    seed(['one', 'two']);
    mount();
    const button = card('t0').querySelector<HTMLButtonElement>('[data-card-menu]') as HTMLButtonElement;
    press(button, ' ');
    button.click(); // opens the menu
    press(document.activeElement as Element, ' ');
    expect(document.querySelector('[data-grabbed]')).toBeNull();

    chooseCardAction('t1', 'Edit');
    const note = editField('note');
    expect(press(note, ' ')).toBe(true); // not default-prevented: the space is typed
    press(editField('title'), ' ');
    expect(document.querySelector('[data-grabbed]')).toBeNull();
    expect(live()).toBe('');
  });

  it('can grab another card while an edit form is open, which stays open', () => {
    seed(['one', 'two', 'three']);
    mount();
    chooseCardAction('t0', 'Edit');
    editField('title').value = 'draft';
    grab('t2');
    press(card('t2'), 'ArrowUp');
    expect(editField('title').value).toBe('draft');
    expect(order('todo')).toEqual(['t2', 't1']); // the form stands in for t0, so t2 is first, then ...
    press(card('t2'), ' ');
    expect(storedTitles('todo')).toEqual(['one', 'three', 'two']); // index 1: below the form's card
  });

  it('holds back a change to the store until the grab ends', () => {
    seed(['one', 'two', 'three']);
    const store = mount();
    grab('t0');
    press(card('t0'), 'ArrowDown');
    store.dispatch((b) => deleteCard(b, 't2'));
    expect(card('t2')).not.toBeNull();
    press(card('t0'), 'Escape');
    expect(document.querySelector('[data-card-id="t2"]')).toBeNull();
    expect(order('todo')).toEqual(['t0', 't1']);
  });

  it('a held key does not drop what Space just grabbed', () => {
    seed(['one', 'two']);
    mount();
    card('t0').focus();
    press(card('t0'), ' ');
    press(card('t0'), ' ', { repeat: true });
    expect(card('t0').dataset.grabbed).toBe('');
  });

  it('ignores the keys with a modifier', () => {
    seed(['one']);
    mount();
    card('t0').focus();
    press(card('t0'), ' ', { ctrlKey: true });
    expect(document.querySelector('[data-grabbed]')).toBeNull();
  });

  it('keeps the grabbed card on screen: scrolls it into view after each move', () => {
    seed(['one', 'two'], ['four']);
    mount();
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    try {
      grab('t0');
      press(card('t0'), 'ArrowRight');
      expect(scroll).toHaveBeenCalled();
      expect(scroll.mock.contexts.at(-1)).toBe(card('t0'));
    } finally {
      delete (Element.prototype as Partial<Element>).scrollIntoView;
    }
  });

  it('does not let a press on a drag handle through to the pointer drag while a card is grabbed', () => {
    seed(['one', 'two']);
    mount();
    const reached = vi.fn();
    q('.board').addEventListener('pointerdown', reached);
    const handle = () => card('t1').querySelector('.card-handle') as Element;
    handle().dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(reached).toHaveBeenCalledTimes(1);
    grab('t0');
    handle().dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(reached).toHaveBeenCalledTimes(1);
  });

  it('has one polite live region and a hint every card is described by', () => {
    seed(['one', 'two']);
    mount();
    expect(document.querySelectorAll('[aria-live="polite"]')).toHaveLength(1);
    expect(q('[aria-live="polite"]').closest('.board')).toBeNull(); // outside the redrawn part
    for (const c of document.querySelectorAll('.card')) {
      const hint = document.getElementById(c.getAttribute('aria-describedby') ?? '');
      expect(hint?.textContent).toContain('Space');
    }
  });

  describe('Move to … in the card menu', () => {
    it('lists the other columns and moves the card to the end of the one chosen, saving it', () => {
      seed(['one', 'two'], ['four']);
      mount();
      card('t0').querySelector<HTMLButtonElement>('[data-card-menu]')?.click();
      expect([...card('t0').querySelectorAll('[role="menuitem"]')].map((i) => i.textContent)).toEqual([
        'Edit',
        'Move to Doing',
        'Move to Done',
        'Delete',
      ]);
      item(card('t0'), 'Move to Doing').click();
      expect(order('doing')).toEqual(['d0', 't0']);
      expect(storedTitles('doing')).toEqual(['four', 'one']);
      expect(storedTitles('todo')).toEqual(['two']);
      expect(document.activeElement).toBe(card('t0'));
    });

    it('moves into an empty column', () => {
      seed(['one']);
      mount();
      chooseCardAction('t0', 'Move to Done');
      expect(storedTitles('done')).toEqual(['one']);
      expect(column('todo').querySelector('.empty-state')).not.toBeNull();
      expect(document.activeElement).toBe(card('t0'));
    });
  });
});
