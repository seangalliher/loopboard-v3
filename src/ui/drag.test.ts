// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { addCard, deleteCard, emptyBoard, type ColumnId } from '../model';
import { STORAGE_KEY, saveBoard, type StorageLike } from '../storage';
import { createStore, type Store } from '../store';
import { mountBoard } from './board';

let data: Map<string, string>;
let store: Store;
let frames: FrameRequestCallback[];

const q = <T extends Element>(selector: string) => document.querySelector(selector) as T;
const column = (id: ColumnId) => q<HTMLElement>(`[data-column-id="${id}"]`);
const cardEl = (id: string) => q<HTMLElement>(`[data-card-id="${id}"]`);
const ids = (id: ColumnId) => store.getState().columns.find((c) => c.id === id)?.cards.map((c) => c.id);
const boardEl = () => q<HTMLElement>('.board');

/** jsdom has no layout: give columns 320 px wide at x = 0, 336, 672 and 60 px cards (8 px apart) from y = 50. */
function layOut() {
  const box = (left: number, top: number, width: number, height: number) =>
    ({ left, top, right: left + width, bottom: top + height, width, height, x: left, y: top }) as DOMRect;
  document.querySelectorAll<HTMLElement>('.column').forEach((col, i) => {
    const left = i * 336;
    col.getBoundingClientRect = () => box(left, 0, 320, 600);
    const body = col.querySelector<HTMLElement>('.column-body');
    if (body) body.getBoundingClientRect = () => box(left, 50, 320, 500);
    col.querySelectorAll<HTMLElement>('[data-card-id], [data-editing-card-id]').forEach((card, n) => {
      card.getBoundingClientRect = () => box(left + 8, 50 + n * 68, 304, 60);
    });
  });
  boardEl().getBoundingClientRect = () => box(0, 0, 992, 600);
}

function pointer(type: string, target: EventTarget, x: number, y: number, init: PointerEventInit = {}) {
  target.dispatchEvent(
    new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, isPrimary: true, button: 0, ...init }),
  );
}

const handle = (id: string) => cardEl(id).querySelector<HTMLElement>('.card-handle') as HTMLElement;
const press = (id: string, x = 20, y = 70) => pointer('pointerdown', handle(id), x, y);
const move = (x: number, y: number) => pointer('pointermove', window, x, y);
const release = (x: number, y: number) => pointer('pointerup', window, x, y);
const escape = () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
const ghost = () => document.querySelector<HTMLElement>('.drag-ghost');
const indicator = () => document.querySelector<HTMLElement>('.drop-indicator');

beforeAll(() => {
  HTMLElement.prototype.setPointerCapture = () => {};
});

beforeEach(() => {
  data = new Map();
  frames = [];
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
  vi.stubGlobal('cancelAnimationFrame', () => {});
  const storage: StorageLike = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
  let board = emptyBoard();
  for (const id of ['a', 'b', 'c']) board = addCard(board, 'todo', { id, title: id });
  board = addCard(board, 'doing', { id: 'd', title: 'd' });
  saveBoard(board, storage);
  store = createStore(storage);
  const root = document.createElement('main');
  document.body.replaceChildren(root);
  mountBoard(root, store);
  layOut();
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('drag from the handle', () => {
  it('shows a tilted copy, the placeholder, the drop indicator and the target column while dragging', () => {
    press('a');
    expect(ghost()).toBeNull(); // not until the pointer has moved a little
    move(21, 71);
    expect(ghost()).toBeNull();

    move(400, 100); // over "doing", below its card's middle
    expect(ghost()?.classList.contains('card')).toBe(true);
    expect(ghost()?.textContent).toContain('a');
    expect(ghost()?.hasAttribute('data-card-id')).toBe(false);
    expect(ghost()?.getAttribute('aria-hidden')).toBe('true');
    expect(cardEl('a').classList.contains('is-dragging')).toBe(true);
    expect(column('doing').classList.contains('is-drop-target')).toBe(true);
    expect(column('todo').classList.contains('is-drop-target')).toBe(false);
    expect(indicator()?.hidden).toBe(false);
    expect(indicator()?.style.top).toBe('112.5px'); // below "d" (bottom 110) + 4, minus half the line
    expect(ghost()?.style.translate).toBe('388px 80px'); // pointer minus where the handle was grabbed in the card
  });

  it('drops on another column and persists', () => {
    press('a');
    move(400, 100);
    release(400, 100);
    expect(ids('todo')).toEqual(['b', 'c']);
    expect(ids('doing')).toEqual(['d', 'a']);
    expect(ghost()).toBeNull();
    expect(indicator()).toBeNull();
    expect(JSON.parse(data.get(STORAGE_KEY) ?? '{}').columns[1].cards.map((c: { id: string }) => c.id)).toEqual(['d', 'a']);
    expect(column('doing').classList.contains('is-drop-target')).toBe(false);
    expect(boardEl().classList.contains('is-dragging')).toBe(false);
  });

  it('drops at a position inside the same column, using the final index', () => {
    press('a');
    move(100, 160); // below "b" (middle 148), above "c" (middle 216)
    release(100, 160);
    expect(ids('todo')).toEqual(['b', 'a', 'c']);
  });

  it('moves a card up in its column', () => {
    press('c', 20, 200);
    move(100, 60);
    release(100, 60);
    expect(ids('todo')).toEqual(['c', 'a', 'b']);
  });

  it('leaves the board alone when dropped back where it was', () => {
    const before = store.getState();
    press('b', 20, 150);
    move(100, 140);
    release(100, 140);
    expect(store.getState()).toBe(before);
  });

  it('drops into an empty column, where the indicator also shows', () => {
    store.dispatch((b) => deleteCard(b, 'd'));
    layOut();
    expect(column('doing').querySelector('.card-list')).toBeNull();
    press('a');
    move(400, 300);
    expect(column('doing').classList.contains('is-drop-target')).toBe(true);
    expect(indicator()?.hidden).toBe(false);
    expect(indicator()?.style.top).toBe('52.5px'); // near the top of the card area
    release(400, 300);
    expect(ids('doing')).toEqual(['a']);
  });

  it('does not redraw while dragging, then redraws once when the drag ends', () => {
    const card = cardEl('b');
    const list = column('todo').querySelector('.card-list');
    press('a');
    move(400, 100);
    store.dispatch((b) => addCard(b, 'done', { id: 'z', title: 'z' })); // a change arriving mid-drag
    expect(cardEl('b')).toBe(card);
    expect(column('todo').querySelector('.card-list')).toBe(list);
    expect(document.querySelector('[data-card-id="z"]')).toBeNull();

    escape();
    expect(document.querySelector('[data-card-id="z"]')).not.toBeNull();
    expect(cardEl('b')).not.toBe(card);
    expect(ids('todo')).toEqual(['a', 'b', 'c']);
  });
});

describe('while a card is being edited', () => {
  const edit = (id: string) => {
    cardEl(id).querySelector<HTMLButtonElement>('[data-card-menu]')?.click();
    [...cardEl(id).querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((i) => i.textContent === 'Edit')?.click();
    layOut();
  };
  const title = () => q<HTMLInputElement>('.card-editing [name="title"]');

  it('counts the open form as its card, so the dropped index matches the indicator', () => {
    edit('b');
    press('a');
    move(100, 300); // below "c"
    release(100, 300);
    expect(ids('todo')).toEqual(['b', 'c', 'a']);
  });

  it('counts the open form for a card coming from another column', () => {
    edit('b');
    press('d', 350, 70);
    move(100, 300);
    release(100, 300);
    expect(ids('todo')).toEqual(['a', 'b', 'c', 'd']);
  });

  it('keeps the draft and the focus through a drag', () => {
    edit('b');
    title().value = 'draft';
    press('a');
    move(100, 300);
    release(100, 300);
    expect(title().value).toBe('draft');
    expect(document.activeElement).toBe(title());
  });
});

describe('cancelling', () => {
  function expectRestored() {
    expect(ids('todo')).toEqual(['a', 'b', 'c']);
    expect(ids('doing')).toEqual(['d']);
    expect(ghost()).toBeNull();
    expect(indicator()).toBeNull();
    expect(document.querySelector('.is-dragging, .is-drop-target')).toBeNull();
  }

  it('Escape cancels and restores', () => {
    press('a');
    move(400, 100);
    escape();
    expectRestored();
    release(400, 100); // a later release does nothing
    expectRestored();
  });

  it('dropping outside any column cancels', () => {
    press('a');
    move(328, 100); // in the gap between the columns
    expect(indicator()?.hidden).toBe(true);
    expect(column('todo').classList.contains('is-drop-target')).toBe(false);
    release(328, 100);
    expectRestored();
  });

  it('a pointercancel cancels', () => {
    press('a');
    move(400, 100);
    pointer('pointercancel', window, 400, 100);
    expectRestored();
  });

  it('losing pointer capture cancels, and a later release does not commit', () => {
    press('a');
    move(400, 100);
    handle('a').dispatchEvent(new PointerEvent('lostpointercapture', { bubbles: true, pointerId: 1 }));
    expectRestored();
    move(400, 100);
    release(400, 100);
    expectRestored();
  });

  it('losing capture of another pointer does not cancel', () => {
    press('a');
    move(400, 100);
    handle('a').dispatchEvent(new PointerEvent('lostpointercapture', { bubbles: true, pointerId: 2 }));
    expect(ghost()).not.toBeNull();
  });

  it('a window blur cancels, and a later release does not commit', () => {
    press('a');
    move(400, 100);
    window.dispatchEvent(new Event('blur'));
    expectRestored();
    move(400, 100);
    release(400, 100);
    expectRestored();
  });

  it('releases capture it still holds when the drag ends', () => {
    const el = handle('a');
    const release = vi.fn();
    el.hasPointerCapture = () => true;
    el.releasePointerCapture = release;
    press('a');
    move(400, 100);
    escape();
    expect(release).toHaveBeenCalledWith(1);
  });

  it('stops listening once the drag has ended', () => {
    press('a');
    move(400, 100);
    release(400, 100);
    move(700, 100);
    expect(ghost()).toBeNull();
    expect(indicator()).toBeNull();
    escape();
    expect(ids('doing')).toEqual(['d', 'a']);
  });
});

describe('what starts a drag', () => {
  it('ignores a press that is not on a handle', () => {
    pointer('pointerdown', cardEl('a').querySelector('.card-title') as HTMLElement, 20, 70);
    move(400, 100);
    expect(ghost()).toBeNull();
    expect(cardEl('a').classList.contains('is-dragging')).toBe(false);
  });

  it('ignores secondary buttons and non-primary pointers', () => {
    pointer('pointerdown', handle('a'), 20, 70, { button: 2 });
    move(400, 100);
    expect(ghost()).toBeNull();
    pointer('pointerdown', handle('a'), 20, 70, { isPrimary: false });
    move(400, 100);
    expect(ghost()).toBeNull();
  });

  it('treats a press and release on the handle without moving as nothing', () => {
    const before = store.getState();
    press('a');
    release(20, 70);
    expect(store.getState()).toBe(before);
    expect(ghost()).toBeNull();
    expect(cardEl('a').classList.contains('is-dragging')).toBe(false);
  });

  it('ignores moves from another pointer', () => {
    press('a');
    pointer('pointermove', window, 400, 100, { pointerId: 2 });
    expect(ghost()).toBeNull();
    pointer('pointerup', window, 400, 100, { pointerId: 2 });
    move(400, 100);
    expect(ghost()).not.toBeNull();
  });
});

describe('sideways auto-scroll', () => {
  it('scrolls the board while the pointer is near its edge, until the end', () => {
    const el = boardEl();
    let left = 0;
    Object.defineProperty(el, 'scrollWidth', { value: 1200 });
    Object.defineProperty(el, 'clientWidth', { value: 992 });
    Object.defineProperty(el, 'scrollLeft', { get: () => left, set: (v: number) => void (left = Math.min(v, 208)) });
    press('a');
    move(980, 100); // within 48 px of the right edge
    for (let i = 0; i < 30 && frames.length > 0; i++) frames.shift()?.(0);
    expect(left).toBe(208); // reached the end and the loop stopped
    expect(frames).toHaveLength(0);

    move(500, 100); // away from the edge: nothing more
    for (const frame of frames.splice(0)) frame(0);
    expect(left).toBe(208);
  });

  it('does nothing when the board does not scroll', () => {
    press('a');
    move(980, 100);
    for (const frame of frames.splice(0)) frame(0);
    expect(frames).toHaveLength(0);
  });
});
