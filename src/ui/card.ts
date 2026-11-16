import { CalendarDays } from 'lucide';
import { isOverdue, type Card, type ColumnId } from '../model';
import { icon } from './icon';

/** "Nov 20", with the year when it is not the current one. `due` is `YYYY-MM-DD`. */
function formatDue(due: string, today: Date): string {
  const [year, month, day] = due.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: year === today.getFullYear() ? undefined : 'numeric',
  });
}

/**
 * One card. It is focusable so the board can restore focus after a re-render
 * (matched on `data-card-id`) and so later issues can add keyboard moves.
 * All user text goes in with `textContent`.
 */
export function createCard(card: Card, columnId: ColumnId, today: Date): HTMLLIElement {
  const el = document.createElement('li');
  el.className = 'card';
  el.dataset.cardId = card.id;
  el.tabIndex = 0;

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
