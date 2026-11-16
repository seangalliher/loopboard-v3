import { TriangleAlert, X } from 'lucide';
import { addCard, deleteCard, localDate, setWipLimit, updateCard, type Card, type ColumnId } from '../model';
import type { Store } from '../store';
import { createAddForm, createEditForm, type AddForm, type EditForm, type NewCardValues } from './add-form';
import type { CardActions } from './card';
import { createColumn } from './column';
import { icon } from './icon';
import { WIP_ERROR, createWipForm, limitFromText, type WipForm } from './wip-form';

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

  // The add forms and WIP panels live outside the redraw so a half-typed value survives a
  // change elsewhere. An open edit form does too, for the same reason.
  const forms = new Map<ColumnId, AddForm>();
  const wipForms = new Map<ColumnId, WipForm>();
  let editing: { cardId: string; form: EditForm } | null = null;
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

  function findColumn(id: ColumnId): HTMLElement | undefined {
    return [...columns.querySelectorAll<HTMLElement>('.column')].find((el) => el.dataset.columnId === id);
  }

  function startEdit(cardId: string) {
    const card = store
      .getState()
      .columns.flatMap((c) => c.cards)
      .find((c) => c.id === cardId);
    if (!card) return;
    const form = createEditForm(
      card,
      (values) => saveEdit(card, values),
      () => stopEdit(cardId),
    );
    editing = { cardId, form };
    render();
    form.focus();
  }

  /** Closes the edit form without changing anything and puts focus back on the card. */
  function stopEdit(cardId: string) {
    editing = null;
    render();
    findCard(cardId)?.focus();
  }

  /** Saves the edit; true when it was accepted. An unchanged card just closes the form. */
  function saveEdit(card: Card, values: NewCardValues): boolean {
    if (values.title.trim() === card.title && values.note === card.note && values.due === (card.due ?? '')) {
      stopEdit(card.id);
      return true;
    }
    const before = store.getState();
    const open = editing;
    editing = null; // so the redraw below shows the card, not the form
    const result = store.dispatch((b) => updateCard(b, card.id, values));
    if (store.getState() === before) {
      editing = open;
      return false;
    }
    showStatus(result.ok ? null : result.error);
    findCard(card.id)?.focus();
    return true;
  }

  /** Deletes the card; focus goes to the next card in the column, else the previous, else Add card. */
  function remove(cardId: string) {
    const column = store.getState().columns.find((c) => c.cards.some((x) => x.id === cardId));
    if (!column) return;
    const index = column.cards.findIndex((x) => x.id === cardId);
    const neighbour = column.cards[index + 1] ?? column.cards[index - 1];
    if (editing?.cardId === cardId) editing = null;
    const result = store.dispatch((b) => deleteCard(b, cardId));
    showStatus(result.ok ? null : result.error);
    if (neighbour) findCard(neighbour.id)?.focus();
    else findColumn(column.id)?.querySelector<HTMLElement>('[data-add-card]:not([hidden])')?.focus();
  }

  const cardActions: CardActions = { onEdit: startEdit, onDelete: remove };

  /** Applies the limit through the model; the form shows the returned message, if any. */
  function changeLimit(columnId: ColumnId, limit: number | null): string | null {
    const before = store.getState();
    const result = store.dispatch((b) => setWipLimit(b, columnId, limit));
    if (store.getState() === before) return WIP_ERROR;
    showStatus(result.ok ? null : result.error);
    return null;
  }

  function wipFormFor(columnId: ColumnId, title: string): WipForm {
    let form = wipForms.get(columnId);
    if (!form) {
      form = createWipForm(title, {
        onSave: (text) => changeLimit(columnId, limitFromText(text)),
        onClear: () => void changeLimit(columnId, null),
        onClosed: () => findColumn(columnId)?.querySelector<HTMLElement>('[data-column-menu]')?.focus(),
      });
      wipForms.set(columnId, form);
    }
    return form;
  }

  function render() {
    if (editing && !store.getState().columns.some((c) => c.cards.some((x) => x.id === editing?.cardId))) {
      editing = null;
    }
    const active = document.activeElement instanceof HTMLElement && root.contains(document.activeElement)
      ? document.activeElement
      : null;
    const focusedId = active?.closest<HTMLElement>('[data-card-id]')?.dataset.cardId;
    const onCardMenu = active?.hasAttribute('data-card-menu') ?? false;
    const onColumnMenu = active?.hasAttribute('data-column-menu')
      ? (active.closest<HTMLElement>('.column')?.dataset.columnId as ColumnId | undefined)
      : undefined;
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
        const wipForm = wipFormFor(column.id, column.title);
        return createColumn(column, today, {
          composer: form.element,
          wipForm: wipForm.element,
          editing: editing ? { cardId: editing.cardId, element: editing.form.element } : null,
          onSetWipLimit: () => {
            wipForm.open(store.getState().columns.find((c) => c.id === column.id)?.wipLimit ?? null);
          },
          cardActions,
        });
      }),
    );

    columns.scrollLeft = scrollLeft;
    for (const body of columns.querySelectorAll<HTMLElement>('.column-body')) {
      body.scrollTop = scrollTops.get(body.closest<HTMLElement>('.column')?.dataset.columnId ?? '') ?? 0;
    }

    if (focusedId !== undefined) {
      const card = findCard(focusedId);
      (onCardMenu ? card?.querySelector<HTMLElement>('[data-card-menu]') : card)?.focus();
    } else if (onColumnMenu !== undefined) {
      findColumn(onColumnMenu)?.querySelector<HTMLElement>('[data-column-menu]')?.focus();
    } else if (active?.isConnected && document.activeElement !== active) {
      active.focus();
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
