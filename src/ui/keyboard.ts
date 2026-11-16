// Keyboard moves: the "grab" pattern. With a card focused, Space lifts it, the arrow keys move it
// (left/right to another column, up/down within the column), Space or Enter drops it and Escape
// puts it back. The first half of this file is the pure state machine; `attachKeyboard` wires it
// to the board's DOM.
//
// While a card is grabbed the board shows it in its prospective position (the board redraws from
// `previewBoard`) but nothing is saved until the drop. Focus leaving the card (Tab, a click
// elsewhere) cancels the grab, so a grab never outlives the user's attention: Tab moves on and
// the card goes back where it was. Switching to another window does not cancel it.

import { moveCard, type Board, type ColumnId } from '../model';

/** Where a card is, or would be: the column and the final index in it. */
export interface Position {
  columnId: ColumnId;
  index: number;
}

export interface Grab {
  cardId: string;
  /** Where the card was when it was grabbed; Escape goes back here. */
  origin: Position;
  /** Where it is now. */
  position: Position;
}

export type Direction = 'left' | 'right' | 'up' | 'down';

/** The cards of `column` other than the grabbed one: the room the grabbed card can be placed among. */
function othersIn(board: Board, columnId: ColumnId, cardId: string): number {
  return (board.columns.find((c) => c.id === columnId)?.cards ?? []).filter((c) => c.id !== cardId).length;
}

/** Grabs the card where it is. Null for an unknown card. */
export function grabCard(board: Board, cardId: string): Grab | null {
  for (const column of board.columns) {
    const index = column.cards.findIndex((c) => c.id === cardId);
    if (index !== -1) {
      const at = { columnId: column.id, index };
      return { cardId, origin: at, position: at };
    }
  }
  return null;
}

/**
 * One arrow-key step. Left and right go to the neighbouring column, keeping the index but never
 * past the end of that column; up and down move one place. At an edge nothing moves and the same
 * `grab` object comes back.
 */
export function moveGrab(board: Board, grab: Grab, direction: Direction): Grab {
  const { columnId, index } = grab.position;
  const at = board.columns.findIndex((c) => c.id === columnId);
  const column = board.columns[direction === 'left' ? at - 1 : direction === 'right' ? at + 1 : at];
  if (!column) return grab;
  const last = othersIn(board, column.id, grab.cardId);
  const wanted = direction === 'up' ? index - 1 : direction === 'down' ? index + 1 : index;
  const next = Math.min(Math.max(wanted, 0), last);
  if (column.id === columnId && next === index) return grab;
  return { ...grab, position: { columnId: column.id, index: next } };
}

/** The board as it would be after the drop: what `moveCard` makes of the grab's position. */
export function previewBoard(board: Board, grab: Grab): Board {
  return moveCard(board, grab.cardId, grab.position.columnId, grab.position.index);
}

/** Where a drop puts the card. */
export function dropGrab(grab: Grab): Position {
  return grab.position;
}

/** Where a cancel puts the card: back where it was grabbed. */
export function cancelGrab(grab: Grab): Position {
  return grab.origin;
}

/** "To do, position 2 of 3" for the card at `at` (the column's count includes the card). */
function where(board: Board, cardId: string, at: Position): string {
  const title = board.columns.find((c) => c.id === at.columnId)?.title ?? '';
  return `${title}, position ${at.index + 1} of ${othersIn(board, at.columnId, cardId) + 1}`;
}

function cardTitle(board: Board, cardId: string): string {
  return board.columns.flatMap((c) => c.cards).find((c) => c.id === cardId)?.title ?? '';
}

/** The texts for the live region. `board` is the saved board, not the preview. */
export const announce = {
  grabbed: (board: Board, grab: Grab) =>
    `Grabbed ${cardTitle(board, grab.cardId)}. Currently in ${where(board, grab.cardId, grab.position)}. ` +
    'Use arrow keys to move, Space to drop, Escape to cancel',
  moved: (board: Board, grab: Grab) =>
    `${cardTitle(board, grab.cardId)} moved to ${where(board, grab.cardId, grab.position)}`,
  dropped: (board: Board, grab: Grab) =>
    `Dropped ${cardTitle(board, grab.cardId)} in ${where(board, grab.cardId, dropGrab(grab))}`,
  cancelled: (board: Board, grab: Grab) =>
    `Move cancelled. ${cardTitle(board, grab.cardId)} is back in ${where(board, grab.cardId, cancelGrab(grab))}`,
};

/** Every card points at this with `aria-describedby`, so a screen reader says how to start. */
export const MOVE_HINT_ID = 'card-move-hint';
export const MOVE_HINT = 'Press Space to pick this card up, then use the arrow keys to move it.';

const DIRECTIONS: Record<string, Direction> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
};

export interface KeyboardOptions {
  /** The saved board (not the preview). */
  getBoard: () => Board;
  /** False while something else (a pointer drag) is moving a card. */
  canGrab: () => boolean;
  /** The grab started, moved or ended: redraw the board (from `previewBoard` while `grab` is set). */
  onChange: () => void;
  /** Space or Enter dropped the card; `grab` is already null when this runs. */
  onDrop: (cardId: string, to: Position) => void;
  /** Text for the live region. */
  announce: (message: string) => void;
}

export interface Keyboard {
  /** The card in hand, or null. */
  readonly grab: Grab | null;
}

/** Marks the grabbed card in the DOM. The class is the style hook; the data attribute is for tests and tools. */
function markGrabbed(el: HTMLElement) {
  el.classList.add('is-grabbed');
  el.dataset.grabbed = '';
}

/**
 * Wires the grab pattern to `board`. Only a keypress on the card itself counts (the event target
 * is the card, not its "…" button or a form field inside it), so Space in a text field or on a
 * button keeps its normal meaning.
 */
export function attachKeyboard(board: HTMLElement, options: KeyboardOptions): Keyboard {
  let grab: Grab | null = null;

  function findCard(id: string): HTMLElement | undefined {
    return [...board.querySelectorAll<HTMLElement>('[data-card-id]')].find((el) => el.dataset.cardId === id);
  }

  /** Redraws, then marks the grabbed card and keeps focus on it. */
  function refresh() {
    options.onChange();
    if (!grab) return;
    const el = findCard(grab.cardId);
    if (!el) return;
    markGrabbed(el);
    el.focus();
    el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); // the next column may be off screen on a phone
  }

  function end(finish: (g: Grab) => void) {
    const g = grab;
    if (!g) return;
    grab = null;
    finish(g);
    refresh();
  }

  function cancel() {
    end((g) => options.announce(announce.cancelled(options.getBoard(), g)));
  }

  function drop() {
    end((g) => {
      options.announce(announce.dropped(options.getBoard(), g));
      options.onDrop(g.cardId, dropGrab(g));
    });
  }

  board.addEventListener('keydown', (e) => {
    const card = e.target instanceof HTMLElement && e.target.matches('[data-card-id]') ? e.target : null;
    if (!card || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;

    if (!grab) {
      if (e.key !== ' ') return;
      e.preventDefault(); // no page scroll
      if (e.repeat || !options.canGrab()) return;
      grab = grabCard(options.getBoard(), card.dataset.cardId ?? '');
      if (!grab) return;
      options.announce(announce.grabbed(options.getBoard(), grab));
      refresh();
      return;
    }

    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (!e.repeat) drop();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    } else if (e.key in DIRECTIONS) {
      e.preventDefault();
      const next = moveGrab(options.getBoard(), grab, DIRECTIONS[e.key]);
      if (next === grab) return;
      grab = next;
      options.announce(announce.moved(options.getBoard(), grab));
      refresh();
    }
  });

  // Focus left the card (Tab, a click elsewhere): cancel. Checked in a later task, not a microtask:
  // `focusout` runs before the browser has focused the next control, and the redraw that a cancel
  // makes has to see that control to give it focus back. It also lets a redraw of the grab's own
  // moves, which replaces the card and refocuses the new one, finish first.
  board.addEventListener('focusout', () => {
    setTimeout(() => {
      if (grab && document.activeElement !== findCard(grab.cardId)) cancel();
    });
  });

  // A press on a drag handle must not start a pointer drag while a card is in hand.
  board.addEventListener(
    'pointerdown',
    (e) => {
      if (grab && e.target instanceof Element && e.target.closest('.card-handle')) e.stopPropagation();
    },
    true,
  );

  return {
    get grab() {
      return grab;
    },
  };
}
