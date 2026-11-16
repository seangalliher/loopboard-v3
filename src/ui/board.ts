import { TriangleAlert, X } from 'lucide';
import { addCard, deleteCard, localDate, moveCard, setWipLimit, updateCard, type Card, type ColumnId } from '../model';
import type { Store } from '../store';
import { createAddForm, createEditForm, type AddForm, type EditForm, type NewCardValues } from './add-form';
import type { CardActions } from './card';
import { createColumn } from './column';
import { attachDrag } from './drag';
import { icon } from './icon';
import { MOVE_HINT, MOVE_HINT_ID, attachKeyboard, previewBoard } from './keyboard';
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
 * by element), and scroll positions are kept. While a card is being dragged, or is grabbed with
 * the keyboard, store changes are not drawn; one redraw follows when it ends. A grabbed card is
 * drawn in its prospective position (not saved until the drop) by a redraw the keyboard asks for.
 * Returns `showStatus`, which shows a dismissible message above the board (null clears it).
 */
export function mountBoard(root: HTMLElement, store: Store): { showStatus: (message: string | null) => void } {
  const status = document.createElement('div');
  status.className = 'status';
  status.setAttribute('role', 'status');

  // One polite live region for the keyboard moves, and the text the cards are described by.
  const live = document.createElement('div');
  live.className = 'sr-only';
  live.setAttribute('aria-live', 'polite');
  live.setAttribute('aria-atomic', 'true');
  const hint = document.createElement('p');
  hint.className = 'sr-only';
  hint.id = MOVE_HINT_ID;
  hint.textContent = MOVE_HINT;

  const columns = document.createElement('div');
  columns.className = 'board';
  root.append(status, live, hint, columns);

  // The add forms and WIP panels live outside the redraw so a half-typed value survives a
  // change elsewhere. An open edit form does too, for the same reason.
  const forms = new Map<ColumnId, AddForm>();
  const wipForms = new Map<ColumnId, WipForm>();
  let editing: { cardId: string; card: Card; form: EditForm } | null = null;
  let renderedDay = '';
  let renderWaiting = false;

  /** Saves a move made by a drag or the keyboard; a refused or failed save is shown. */
  function dropCard(cardId: string, to: { columnId: ColumnId; index: number }) {
    const before = store.getState();
    const result = store.dispatch((b) => moveCard(b, cardId, to.columnId, to.index));
    if (store.getState() !== before) showStatus(result.ok ? null : result.error);
  }

  const drag = attachDrag(columns, {
    onDrop: dropCard,
    onFinish: () => {
      if (renderWaiting) render();
    },
  });

  const keyboard = attachKeyboard(columns, {
    getBoard: () => store.getState(),
    canGrab: () => !drag.active,
    onChange: () => render(true),
    onDrop: dropCard,
    announce: (message) => {
      live.textContent = message;
    },
  });

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
    form.element.dataset.editingCardId = cardId; // lets a drag count the form as this card's place
    editing = { cardId, card, form };
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

  /** Moves the card to the end of `to` (from its "…" menu) and puts focus on it. */
  function moveToColumn(cardId: string, to: ColumnId) {
    const end = store.getState().columns.find((c) => c.id === to)?.cards.length ?? 0;
    dropCard(cardId, { columnId: to, index: end });
    const card = findCard(cardId);
    card?.focus();
    card?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }

  const cardActions: CardActions = {
    onEdit: startEdit,
    onDelete: remove,
    onMove: moveToColumn,
    get columns() {
      return store.getState().columns;
    },
  };

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

  /** Draws the board. `own` is a redraw the keyboard asks for; any other call waits for the drag or grab to end. */
  function render(own = false) {
    if (!own && (drag.active || keyboard.grab)) {
      renderWaiting = true;
      return;
    }
    renderWaiting = false;
    const board = keyboard.grab ? previewBoard(store.getState(), keyboard.grab) : store.getState();
    // The form belongs to the card object it was opened on. A moved card is the same object; a
    // removed card or one replaced under the same id (an import) is not, so the form closes.
    if (editing && !board.columns.some((c) => c.cards.some((x) => x === editing?.card))) {
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
      ...board.columns.map((column) => {
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

  store.subscribe(() => render());
  render();
  armMidnightRefresh();
  // Timers can be paused while the page is hidden or frozen, so also check when it comes back.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshIfNewDay();
  });
  window.addEventListener('focus', refreshIfNewDay);
  window.addEventListener('pageshow', refreshIfNewDay);
  return { showStatus };
}
