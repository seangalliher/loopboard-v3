// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addCard, emptyBoard } from '../model';
import { STORAGE_KEY, exportJson, type StorageLike } from '../storage';
import { createStore, type Store } from '../store';
import { MAX_IMPORT_BYTES, createDataMenu, downloadBoard, importText } from './data-menu';

let data: Map<string, string>;
let failing: boolean;
let store: Store;

const incoming = addCard(emptyBoard(), 'doing', { id: 'in-1', title: 'Imported card' });
const incomingText = exportJson(incoming);
const titles = () => store.getState().columns.flatMap((c) => c.cards.map((card) => card.title));

beforeEach(() => {
  data = new Map();
  failing = false;
  const storage: StorageLike = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      if (failing) throw new Error('quota exceeded');
      data.set(k, v);
    },
  };
  store = createStore(storage); // first run: three sample cards
});

describe('importText', () => {
  it('refuses invalid JSON and an invalid board, changing nothing', () => {
    const confirmFn = vi.fn(() => true);
    const before = store.getState();
    for (const text of ['{nope', '{"version":2,"columns":[]}']) {
      const result = importText(text, store, confirmFn);
      expect(result.status).toBe('error');
    }
    expect(store.getState()).toBe(before);
    expect(data.has(STORAGE_KEY)).toBe(false);
    expect(confirmFn).not.toHaveBeenCalled();
  });

  it('refuses text over the size cap', () => {
    const before = store.getState();
    const result = importText(' '.repeat(MAX_IMPORT_BYTES + 1) + incomingText, store, () => true);
    expect(result).toEqual({ status: 'error', error: 'The file is too large (over 10 MB).' });
    expect(store.getState()).toBe(before);
  });

  it('imports a board whose export is just over 1 MB, so a backup always restores', () => {
    let big = emptyBoard();
    for (let i = 0; exportJson(big).length <= 1024 * 1024; i++) {
      big = addCard(big, 'todo', { id: `big-${i}`, title: 'T'.repeat(200), note: 'n'.repeat(2000), due: '2030-01-02' });
    }
    const text = exportJson(big);
    expect(new Blob([text]).size).toBeGreaterThan(1024 * 1024);
    expect(new Blob([text]).size).toBeLessThan(1024 * 1024 + 4000); // just over the old limit
    store.dispatch(() => emptyBoard());
    expect(importText(text, store, () => true)).toEqual({ status: 'imported' });
    expect(store.getState()).toEqual(big);
    expect(exportJson(store.getState())).toBe(text);
  });

  it('does nothing when the confirmation is cancelled', () => {
    const before = store.getState();
    const confirmFn = vi.fn(() => false);
    expect(importText(incomingText, store, confirmFn)).toEqual({ status: 'cancelled' });
    expect(confirmFn).toHaveBeenCalledOnce();
    expect(store.getState()).toBe(before);
    expect(data.has(STORAGE_KEY)).toBe(false);
  });

  it('replaces the whole board and saves it once confirmed', () => {
    expect(importText(incomingText, store, () => true)).toEqual({ status: 'imported' });
    expect(titles()).toEqual(['Imported card']);
    expect(data.get(STORAGE_KEY)).toBe(incomingText);
  });

  it('does not ask when the current board has no cards', () => {
    store.dispatch(() => emptyBoard());
    const confirmFn = vi.fn(() => false);
    expect(importText(incomingText, store, confirmFn)).toEqual({ status: 'imported' });
    expect(confirmFn).not.toHaveBeenCalled();
    expect(titles()).toEqual(['Imported card']);
  });

  it('reports a failed save', () => {
    failing = true;
    const result = importText(incomingText, store, () => true);
    expect(result).toEqual({ status: 'error', error: 'Could not save the board: quota exceeded' });
  });
});

describe('createDataMenu', () => {
  function chooseFile(input: HTMLInputElement, file: File) {
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
  }

  it('has a hidden, untabbable file input and the two menu items', () => {
    const { input, items } = createDataMenu(store, () => {});
    expect(input.type).toBe('file');
    expect(input.hidden).toBe(true);
    expect(input.tabIndex).toBe(-1);
    expect(input.getAttribute('aria-hidden')).toBe('true');
    expect(input.accept).toBe('.json,application/json');
    expect(items.map((i) => i.label)).toEqual(['Import board…', 'Export board']);
    const click = vi.spyOn(input, 'click');
    items[0]?.onSelect();
    expect(click).toHaveBeenCalledOnce();
  });

  it('imports a chosen file, clears the message and resets the input', async () => {
    const report = vi.fn();
    const { input } = createDataMenu(store, report, () => true);
    chooseFile(input, new File([incomingText], 'b.json'));
    await vi.waitFor(() => expect(report).toHaveBeenCalledWith(null));
    expect(titles()).toEqual(['Imported card']);
    expect(input.value).toBe('');
  });

  it('shows the error for an invalid file and still resets the input', async () => {
    const report = vi.fn();
    const { input } = createDataMenu(store, report, () => true);
    const before = store.getState();
    chooseFile(input, new File(['{nope'], 'b.json'));
    await vi.waitFor(() => expect(report).toHaveBeenCalledOnce());
    expect(report.mock.calls[0]?.[0]).toContain('not valid JSON');
    expect(store.getState()).toBe(before);
    expect(input.value).toBe('');
  });

  it('refuses a file over the cap without reading it', async () => {
    const report = vi.fn();
    const { input } = createDataMenu(store, report, () => true);
    const file = new File(['{}'], 'big.json');
    Object.defineProperty(file, 'size', { value: MAX_IMPORT_BYTES + 1 });
    const read = vi.spyOn(file, 'text');
    chooseFile(input, file);
    await vi.waitFor(() => expect(report).toHaveBeenCalledWith('The file is too large (over 10 MB).'));
    expect(read).not.toHaveBeenCalled();
  });
});

describe('downloadBoard', () => {
  it('downloads loopboard.json through a temporary link and revokes the URL', async () => {
    const create = vi.fn(() => 'blob:test');
    const revoke = vi.fn();
    // jsdom has no object URLs; add them for this test and remove them again.
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    try {
      downloadBoard(store);
      const clicked = click.mock.contexts[0] as HTMLAnchorElement;
      expect(clicked.download).toBe('loopboard.json');
      expect(clicked.href).toBe('blob:test');
      expect(document.querySelector('a[download]')).toBeNull();
      expect(revoke).toHaveBeenCalledWith('blob:test');
      const blob = (create.mock.calls[0] as unknown as [Blob])[0];
      expect(await blob.text()).toBe(exportJson(store.getState()));
    } finally {
      click.mockRestore();
      Reflect.deleteProperty(URL, 'createObjectURL');
      Reflect.deleteProperty(URL, 'revokeObjectURL');
    }
  });
});
