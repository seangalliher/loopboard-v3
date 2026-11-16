// The one place the current board lives. Changes go through `dispatch` with a
// function from model.ts, and every change is saved.

import type { Board } from './model';
import { loadBoard, saveBoard, type SaveResult, type StorageLike } from './storage';

export interface Store {
  getState(): Board;
  /**
   * Replaces the board with `update(current)`, for example
   * `store.dispatch((b) => addCard(b, 'todo', { id, title }))`.
   * When `update` returns the same board object nothing is saved or announced.
   * Returns the save result so the UI can show a failure.
   */
  dispatch(update: (board: Board) => Board): SaveResult;
  /** Calls `listener` with the new board after each change. Returns an unsubscribe function. */
  subscribe(listener: (board: Board) => void): () => void;
}

export function createStore(storage?: StorageLike): Store {
  let state = loadBoard(storage);
  const listeners = new Set<(board: Board) => void>();
  return {
    getState: () => state,
    dispatch(update) {
      const next = update(state);
      if (next === state) return { ok: true };
      state = next;
      const result = saveBoard(state, storage);
      for (const listener of [...listeners]) listener(state);
      return result;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
