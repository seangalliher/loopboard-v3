import { describe, expect, it, vi } from 'vitest';
import { addCard, deleteCard, type Board } from './model';
import { exportJson, loadBoard, parseBoard, STORAGE_KEY, type StorageLike } from './storage';
import { createStore } from './store';

function fakeStorage(): StorageLike & { data: Record<string, string> } {
  const data: Record<string, string> = {};
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v;
    },
  };
}

describe('createStore', () => {
  it('starts from the stored board, or the samples on first run', () => {
    const storage = fakeStorage();
    const store = createStore(storage);
    expect(store.getState()).toEqual(loadBoard(fakeStorage()));
    expect(storage.data[STORAGE_KEY]).toBeUndefined();
  });

  it('dispatch updates the state, saves it and notifies subscribers', () => {
    const storage = fakeStorage();
    const store = createStore(storage);
    const seen: Board[] = [];
    store.subscribe((b) => seen.push(b));
    const result = store.dispatch((b) => addCard(b, 'todo', { id: 'new', title: 'New card' }));
    expect(result).toEqual({ ok: true });
    expect(store.getState().columns[0].cards.map((c) => c.id)).toEqual(['sample-1', 'new']);
    expect(seen).toEqual([store.getState()]);
    expect(loadBoard(storage)).toEqual(store.getState());
  });

  it('a card with a 201-character or empty id survives reload and export/import', () => {
    const storage = fakeStorage();
    const store = createStore(storage);
    const longId = 'i'.repeat(201);
    expect(store.dispatch((b) => addCard(b, 'todo', { id: longId, title: 'Long id' }))).toEqual({ ok: true });
    expect(store.dispatch((b) => addCard(b, 'doing', { id: '', title: 'Empty id' }))).toEqual({ ok: true });
    const ids = store.getState().columns.flatMap((c) => c.cards.map((card) => card.id));
    expect(ids).toContain(longId);
    expect(ids).toContain('');
    expect(createStore(storage).getState()).toEqual(store.getState());
    expect(parseBoard(exportJson(store.getState()))).toEqual({ ok: true, board: store.getState() });
  });

  it('saves every change, so a later load sees the board with all cards deleted, not samples', () => {
    const storage = fakeStorage();
    const store = createStore(storage);
    for (const id of ['sample-1', 'sample-2', 'sample-3']) store.dispatch((b) => deleteCard(b, id));
    expect(createStore(storage).getState().columns.flatMap((c) => c.cards)).toEqual([]);
  });

  it('does not save or notify when the update returns the same board', () => {
    const storage = fakeStorage();
    const store = createStore(storage);
    const listener = vi.fn();
    store.subscribe(listener);
    expect(store.dispatch((b) => addCard(b, 'todo', { id: 'x', title: '   ' }))).toEqual({ ok: true });
    expect(listener).not.toHaveBeenCalled();
    expect(storage.data[STORAGE_KEY]).toBeUndefined();
  });

  it('unsubscribe stops notifications', () => {
    const store = createStore(fakeStorage());
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();
    store.dispatch((b) => deleteCard(b, 'sample-1'));
    expect(listener).not.toHaveBeenCalled();
  });

  it('keeps the new state and reports the error when saving fails', () => {
    const failing: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
    };
    const store = createStore(failing);
    const listener = vi.fn();
    store.subscribe(listener);
    const result = store.dispatch((b) => deleteCard(b, 'sample-1'));
    expect(result.ok).toBe(false);
    expect(store.getState().columns[0].cards).toEqual([]);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
