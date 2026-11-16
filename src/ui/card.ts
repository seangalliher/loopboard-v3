import { CalendarDays, Ellipsis, GripVertical, Pencil, Trash2 } from 'lucide';
import { isOverdue, type Card, type ColumnId } from '../model';
import { icon } from './icon';
import { createMenu, type MenuItem } from './menu';

export interface CardActions {
  onEdit: (cardId: string) => void;
  onDelete: (cardId: string) => void;
}

/** "Nov 20", with the year when it is not the current one. `due` is `YYYY-MM-DD`. */
function formatDue(due: string, today: Date): string {
  const [year, month, day] = due.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: year === today.getFullYear() ? undefined : 'numeric',
  });
}

/** The items of a card's "…" menu. Later items (for example "Move to …") are appended here. */
export function cardMenuItems(card: Card, actions: CardActions): MenuItem[] {
  return [
    { label: 'Edit', icon: Pencil, onSelect: () => actions.onEdit(card.id) },
    { label: 'Delete', icon: Trash2, onSelect: () => actions.onDelete(card.id) },
  ];
}

/** Opens the menu upwards when it would run past the bottom of the scrolling column body. */
function flipIfCutOff(panel: HTMLElement) {
  panel.classList.remove('menu-up');
  const body = panel.closest('.column-body');
  if (!body) return;
  const room = body.getBoundingClientRect().bottom - panel.getBoundingClientRect().bottom;
  if (room < 0) panel.classList.add('menu-up');
}

/**
 * One card. It is focusable so the board can restore focus after a re-render
 * (matched on `data-card-id`) and so later issues can add keyboard moves. A drag handle
 * (not yet draggable) and a "…" menu button sit in it, hidden until hover or focus.
 * All user text goes in with `textContent`.
 */
export function createCard(card: Card, columnId: ColumnId, today: Date, actions: CardActions): HTMLLIElement {
  const el = document.createElement('li');
  el.className = 'card';
  el.dataset.cardId = card.id;
  el.tabIndex = 0;

  const handle = document.createElement('span');
  handle.className = 'card-handle';
  handle.setAttribute('aria-hidden', 'true');
  handle.append(icon(GripVertical, 16));

  const anchor = document.createElement('div');
  anchor.className = 'menu-anchor card-actions';
  const menuButton = document.createElement('button');
  menuButton.type = 'button';
  menuButton.className = 'btn btn-icon card-menu-button';
  menuButton.dataset.cardMenu = '';
  menuButton.setAttribute('aria-label', `Card actions: ${card.title}`);
  menuButton.title = 'Card actions';
  menuButton.append(icon(Ellipsis, 16));
  anchor.append(menuButton);
  createMenu(menuButton, cardMenuItems(card, actions), { onOpen: flipIfCutOff });

  el.append(handle, anchor);

  const title = document.createElement('p');
  title.className = 'card-title';
  title.textContent = card.title;
  el.append(title);

  if (card.note !== '') {
    const note = document.createElement('p');
    note.className = 'card-note';
    note.textContent = card.note;
    el.append(note);
  }

  if (card.due !== null) {
    const due = document.createElement('p');
    due.className = 'card-due';
    const overdue = isOverdue(card, columnId, today);
    if (overdue) due.classList.add('is-overdue');
    const time = document.createElement('time');
    time.dateTime = card.due;
    time.textContent = formatDue(card.due, today);
    due.append(icon(CalendarDays, 14));
    if (overdue) {
      // Not colour alone: assistive tech hears that the date has passed.
      const hint = document.createElement('span');
      hint.className = 'sr-only';
      hint.textContent = 'Overdue: ';
      due.append(hint);
    }
    due.append(time);
    el.append(due);
  }

  return el;
}
