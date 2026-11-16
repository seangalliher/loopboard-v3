// Pointer-event drag and drop for cards. A drag starts from a card's handle only, so touch
// scrolling works from everywhere else (the handle alone has `touch-action: none`).
// While a drag is in flight the board DOM is not redrawn (the board defers its renders until
// `onFinish`); the card stays in place as a dim placeholder, a tilted copy follows the pointer
// and a line shows where the card will land.

import type { ColumnId } from '../model';
import { findDropTarget, indicatorTop, type ColumnBox, type DropTarget } from './drop-position';

export interface DragOptions {
  /** The card was dropped on a column and would land at `target`. Not called for a cancel. */
  onDrop: (cardId: string, target: DropTarget) => void;
  /** The drag is over (dropped or cancelled) and `active` is false again. */
  onFinish: () => void;
}

export interface Drag {
  /** True from pressing the handle until the drag ends. */
  readonly active: boolean;
}

/** Pixels the pointer must move before a press on the handle becomes a drag. */
const THRESHOLD = 4;
/** Within this many pixels of the board's left or right edge it scrolls sideways. */
const EDGE = 48;
const SCROLL_STEP = 14;

interface Session {
  cardId: string;
  pointerId: number;
  card: HTMLElement;
  handle: HTMLElement;
  startX: number;
  startY: number;
  /** Where inside the card the handle was pressed. */
  grabX: number;
  grabY: number;
  x: number;
  y: number;
  started: boolean;
  ghost: HTMLElement | null;
  indicator: HTMLElement | null;
  target: DropTarget | null;
  highlighted: HTMLElement | null;
  frame: number;
}

export function attachDrag(board: HTMLElement, options: DragOptions): Drag {
  let session: Session | null = null;

  /** Reads the geometry of every column and card; the DOM element rides along for highlighting. */
  function measure(): (ColumnBox & { el: HTMLElement })[] {
    return [...board.querySelectorAll<HTMLElement>('.column')].map((el) => ({
      el,
      id: el.dataset.columnId as ColumnId,
      rect: el.getBoundingClientRect(),
      body: (el.querySelector('.column-body') ?? el).getBoundingClientRect(),
      // The open edit form stands in for its card (`data-editing-card-id`), so it counts in the order.
      cards: [...el.querySelectorAll<HTMLElement>('[data-card-id], [data-editing-card-id]')].map((card) => ({
        id: card.dataset.cardId ?? card.dataset.editingCardId ?? '',
        rect: card.getBoundingClientRect(),
      })),
    }));
  }

  function begin(s: Session) {
    s.started = true;
    const box = s.card.getBoundingClientRect();
    const ghost = s.card.cloneNode(true) as HTMLElement;
    ghost.classList.add('drag-ghost');
    ghost.removeAttribute('data-card-id');
    ghost.removeAttribute('tabindex');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.inert = true;
    ghost.style.width = `${box.width}px`;
    ghost.style.transformOrigin = `${s.grabX}px ${s.grabY}px`;
    const indicator = document.createElement('div');
    indicator.className = 'drop-indicator';
    indicator.hidden = true;
    s.ghost = ghost;
    s.indicator = indicator;
    s.card.classList.add('is-dragging');
    board.classList.add('is-dragging');
    document.body.append(ghost, indicator);
  }

  /** Moves the copy to the pointer and the indicator and highlight to the current drop target. */
  function update(s: Session) {
    if (!s.ghost || !s.indicator) return;
    s.ghost.style.translate = `${s.x - s.grabX}px ${s.y - s.grabY}px`;
    const columns = measure();
    s.target = findDropTarget(s.x, s.y, columns, s.cardId);
    const column = columns.find((c) => c.id === s.target?.columnId);
    if (s.highlighted !== (column?.el ?? null)) {
      s.highlighted?.classList.remove('is-drop-target');
      column?.el.classList.add('is-drop-target');
      s.highlighted = column?.el ?? null;
    }
    s.indicator.hidden = !s.target || !column;
    if (s.target && column) {
      s.indicator.style.left = `${column.body.left + 8}px`;
      s.indicator.style.width = `${column.body.right - column.body.left - 16}px`;
      s.indicator.style.top = `${indicatorTop(s.target, columns, s.cardId) - 1.5}px`;
    }
  }

  /** Scrolls the board sideways while the pointer is near its edge (the phone layout); stops at the end. */
  function autoScroll() {
    const s = session;
    if (!s) return;
    s.frame = 0;
    const box = board.getBoundingClientRect();
    const direction = s.x < box.left + EDGE ? -1 : s.x > box.right - EDGE ? 1 : 0;
    if (direction === 0 || board.scrollWidth <= board.clientWidth) return;
    const before = board.scrollLeft;
    board.scrollLeft += direction * SCROLL_STEP;
    if (board.scrollLeft === before) return;
    update(s);
    s.frame = requestAnimationFrame(autoScroll);
  }

  function onMove(e: PointerEvent) {
    const s = session;
    if (!s || e.pointerId !== s.pointerId) return;
    s.x = e.clientX;
    s.y = e.clientY;
    if (!s.started) {
      if (Math.hypot(s.x - s.startX, s.y - s.startY) < THRESHOLD) return;
      begin(s);
    }
    update(s);
    if (!s.frame) s.frame = requestAnimationFrame(autoScroll);
  }

  function onUp(e: PointerEvent) {
    if (e.pointerId === session?.pointerId) finish(true);
  }

  function onCancel(e: PointerEvent) {
    if (e.pointerId === session?.pointerId) finish(false);
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') finish(false);
  }

  /** The handle lost the pointer (released elsewhere, element removed): the drag cannot go on. */
  function onLostCapture(e: PointerEvent) {
    if (e.pointerId === session?.pointerId) finish(false);
  }

  function onBlur() {
    finish(false);
  }

  /** Ends the drag. Only a drop on a column calls `onDrop`; anything else leaves the board as it was. */
  function finish(drop: boolean) {
    const s = session;
    if (!s) return;
    session = null;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('lostpointercapture', onLostCapture);
    window.removeEventListener('blur', onBlur);
    if (s.handle.hasPointerCapture?.(s.pointerId)) s.handle.releasePointerCapture(s.pointerId);
    cancelAnimationFrame(s.frame);
    s.ghost?.remove();
    s.indicator?.remove();
    s.highlighted?.classList.remove('is-drop-target');
    s.card.classList.remove('is-dragging');
    board.classList.remove('is-dragging');
    if (drop && s.started && s.target) options.onDrop(s.cardId, s.target);
    options.onFinish();
  }

  board.addEventListener('pointerdown', (e) => {
    if (session || !e.isPrimary || e.button !== 0) return;
    const handle = (e.target as Element).closest<HTMLElement>('.card-handle');
    const card = handle?.closest<HTMLElement>('[data-card-id]');
    if (!handle || !card) return;
    e.preventDefault(); // no text selection, no focus change
    const box = card.getBoundingClientRect();
    session = {
      cardId: card.dataset.cardId ?? '',
      pointerId: e.pointerId,
      card,
      handle,
      startX: e.clientX,
      startY: e.clientY,
      grabX: e.clientX - box.left,
      grabY: e.clientY - box.top,
      x: e.clientX,
      y: e.clientY,
      started: false,
      ghost: null,
      indicator: null,
      target: null,
      highlighted: null,
      frame: 0,
    };
    handle.setPointerCapture(e.pointerId);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKey);
    window.addEventListener('lostpointercapture', onLostCapture);
    window.addEventListener('blur', onBlur);
  });

  return {
    get active() {
      return session !== null;
    },
  };
}
