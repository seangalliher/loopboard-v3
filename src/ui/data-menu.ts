import { Download, Upload } from 'lucide';
import { exportJson, parseBoard } from '../storage';
import type { Store } from '../store';
import type { MenuItem } from './menu';

/**
 * Files above this size are refused without being read. It is far above the largest board that
 * can be saved (browser storage holds about 5 MB), so a backup made by Export always imports.
 */
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
export const EXPORT_FILE_NAME = 'loopboard.json';
const TOO_LARGE = 'The file is too large (over 10 MB).';

export type ImportResult = { status: 'imported' } | { status: 'cancelled' } | { status: 'error'; error: string };

function cardCount(store: Store): number {
  return store.getState().columns.reduce((sum, column) => sum + column.cards.length, 0);
}

/**
 * Replaces the whole board with the one in `text`. Invalid or oversized text changes nothing.
 * When the current board has cards, `confirmReplace` is asked first and a `false` answer changes
 * nothing. A failed save still replaces the board in memory and is reported as an error.
 */
export function importText(text: string, store: Store, confirmReplace: (message: string) => boolean): ImportResult {
  if (text.length > MAX_IMPORT_BYTES) return { status: 'error', error: TOO_LARGE };
  const parsed = parseBoard(text);
  if (!parsed.ok) return { status: 'error', error: `Could not import: ${parsed.error}` };
  const count = cardCount(store);
  if (count > 0 && !confirmReplace(`Importing replaces the whole board, including its ${count} card${count === 1 ? '' : 's'}. Continue?`)) {
    return { status: 'cancelled' };
  }
  const saved = store.dispatch(() => parsed.board);
  return saved.ok ? { status: 'imported' } : { status: 'error', error: saved.error };
}

/** Reads `file` as text (refusing a large one before reading it) and imports it. */
export async function importFile(
  file: File,
  store: Store,
  confirmReplace: (message: string) => boolean,
): Promise<ImportResult> {
  if (file.size > MAX_IMPORT_BYTES) return { status: 'error', error: TOO_LARGE };
  let text: string;
  try {
    text = await file.text();
  } catch {
    return { status: 'error', error: 'The file could not be read.' };
  }
  return importText(text, store, confirmReplace);
}

/** Downloads the board as `loopboard.json`. */
export function downloadBoard(store: Store): void {
  const url = URL.createObjectURL(new Blob([exportJson(store.getState())], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = EXPORT_FILE_NAME;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * The Import and Export menu items, and the file input Import opens. The input is never shown
 * and never tabbable; append it anywhere in the page. `report` gets a message to show, or null
 * to clear the last one.
 */
export function createDataMenu(
  store: Store,
  report: (message: string | null) => void,
  confirmReplace: (message: string) => boolean = (message) => window.confirm(message),
): { input: HTMLInputElement; items: MenuItem[] } {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.hidden = true;
  input.tabIndex = -1;
  input.setAttribute('aria-hidden', 'true');

  input.addEventListener('change', () => {
    const file = input.files?.[0];
    // Reset so choosing the same file again fires another change event.
    const done = (result: ImportResult) => {
      input.value = '';
      if (result.status === 'error') report(result.error);
      else if (result.status === 'imported') report(null);
    };
    if (!file) return;
    void importFile(file, store, confirmReplace).then(done);
  });

  return {
    input,
    items: [
      { label: 'Import board…', icon: Upload, onSelect: () => input.click() },
      { label: 'Export board', icon: Download, onSelect: () => downloadBoard(store) },
    ],
  };
}
