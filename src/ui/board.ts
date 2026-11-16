import { TriangleAlert, X } from 'lucide';
import { addCard, localDate, type ColumnId } from '../model';
import type { Store } from '../store';
import { createAddForm, type AddForm, type NewCardValues } from './add-form';
import { createColumn } from './column';
import { icon } from './icon';

/** `crypto.randomUUID` only exists in secure contexts (https, localhost); a LAN preview has none. */
function newId(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Draws the board into `root` and redraws it from the store's state after every change.
 * Focus is restored by `data-card-id` (or, for the add-card controls, which survive redraws,
 * by element), and scroll positions are kept.
 */
export function mountBoard(root: HTMLElement, store: Store): void {
  const status = document.createElement('div');
  status.className = 'status';
  status.setAttribute('role', 'status');

  const columns = document.createElement('div');
  columns.className = 'board';
  root.append(status, columns);

  // The add forms live outside the redraw so a half-typed card survives a change elsewhere.
  const forms = new Map<ColumnId, AddForm>();
  let renderedDay = '';

  function showStatus(message: string | null) {
    if (message === null) {
      status.replaceChildren();
      return;
    }
    const banner = document.createElement('div');
    banner.className = 'status-banner';
    const text = document.createElement('p');
    text.textContent = message;
    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'btn btn-icon';
    dismiss.setAttribute('aria-label', 'Dismiss message');
    dismiss.title = 'Dismiss';
    dismiss.append(icon(X, 16));
    dismiss.addEventListener('click', () => showStatus(null));
    const warn = icon(TriangleAlert, 18);
    warn.classList.add('status-icon');
    banner.append(warn, text, dismiss);
    status.replaceChildren(banner);
  }

  /** Adds the card; true when it was accepted. A failed save is shown, not thrown. */
  function add(columnId: ColumnId, values: NewCardValues): boolean {
    const before = store.getState();
    const id = newId();
    const result = store.dispatch((b) => addCard(b, columnId, { id, ...values }));
    if (store.getState() === before) return false;
    showStatus(result.ok ? null : result.error);
    findCard(id)?.scrollIntoView?.({ block: 'nearest' });
    return true;
  }

  function findCard(id: string): HTMLElement | undefined {
    return [...columns.querySelectorAll<HTMLElement>('[data-card-id]')].find((el) => el.dataset.cardId === id);
  }

  function render() {
    const active = document.activeElement;
    const focusedCard = active instanceof HTMLElement ? active.closest<HTMLElement>('[data-card-id]') : null;
    const focusedId = root.contains(focusedCard) ? focusedCard?.dataset.cardId : undefined;
    const keepFocus = active instanceof HTMLElement && root.contains(active) ? active : null;
    const scrollLeft = columns.scrollLeft;
    const scrollTops = new Map<string, number>();
    for (const body of columns.querySelectorAll<HTMLElement>('.column-body')) {
      scrollTops.set(body.closest<HTMLElement>('.column')?.dataset.columnId ?? '', body.scrollTop);
    }

    const today = new Date();
    renderedDay = localDate(today);
    columns.replaceChildren(
      ...store.getState().columns.map((column) => {
        let form = forms.get(column.id);
        if (!form) {
          form = createAddForm(column.title, (values) => add(column.id, values));
          forms.set(column.id, form);
        }
        return createColumn(column, today, form.element);
      }),
    );

    columns.scrollLeft = scrollLeft;
    for (const body of columns.querySelectorAll<HTMLElement>('.column-body')) {
      body.scrollTop = scrollTops.get(body.closest<HTMLElement>('.column')?.dataset.columnId ?? '') ?? 0;
    }

    if (focusedId !== undefined) {
      findCard(focusedId)?.focus();
    } else if (keepFocus?.isConnected && document.activeElement !== keepFocus) {
      keepFocus.focus();
    }
  }

  /** Overdue marks depend on the date, so redraw when the local day has changed since the last draw. */
  function refreshIfNewDay() {
    if (localDate(new Date()) !== renderedDay) render();
  }

  function armMidnightRefresh() {
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    setTimeout(() => {
      refreshIfNewDay();
      armMidnightRefresh();
    }, midnight.getTime() - now.getTime());
  }

  store.subscribe(render);
  render();
  armMidnightRefresh();
  // Timers can be paused while the page is hidden or frozen, so also check when it comes back.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshIfNewDay();
  });
  window.addEventListener('focus', refreshIfNewDay);
  window.addEventListener('pageshow', refreshIfNewDay);
}
