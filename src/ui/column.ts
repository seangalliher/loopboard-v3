import { CircleCheck, Inbox, Timer, type IconNode } from 'lucide';
import type { Column, ColumnId } from '../model';
import { createCard } from './card';
import { icon } from './icon';

const EMPTY_STATES: Record<ColumnId, { icon: IconNode; hint: string }> = {
  todo: { icon: Inbox, hint: 'Nothing planned yet. Add a card to get started.' },
  doing: { icon: Timer, hint: 'Nothing in progress. Move a card here when you start it.' },
  done: { icon: CircleCheck, hint: 'Finished work will show up here.' },
};

/**
 * One column panel: accent dot, name, count badge, the cards (or an empty-state hint) and the
 * `composer` (the add-card button and form) at the foot. The header is a flex row so a later
 * issue can add its "…" menu button after the badge.
 */
export function createColumn(column: Column, today: Date, composer: HTMLElement): HTMLElement {
  const el = document.createElement('section');
  el.className = 'column';
  el.dataset.columnId = column.id;
  const headingId = `column-title-${column.id}`;
  el.setAttribute('aria-labelledby', headingId);

  const header = document.createElement('header');
  header.className = 'column-header';

  const dot = document.createElement('span');
  dot.className = 'column-dot';
  dot.setAttribute('aria-hidden', 'true');

  const name = document.createElement('h2');
  name.className = 'column-name';
  name.id = headingId;
  name.textContent = column.title;

  const count = document.createElement('span');
  count.className = 'badge';
  count.append(String(column.cards.length));
  const unit = document.createElement('span');
  unit.className = 'sr-only';
  unit.textContent = column.cards.length === 1 ? ' card' : ' cards';
  count.append(unit);

  header.append(dot, name, count);

  const body = document.createElement('div');
  body.className = 'column-body';
  if (column.cards.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    const hint = document.createElement('p');
    hint.textContent = EMPTY_STATES[column.id].hint;
    empty.append(icon(EMPTY_STATES[column.id].icon, 24), hint);
    body.append(empty);
  } else {
    const list = document.createElement('ul');
    list.className = 'card-list';
    list.append(...column.cards.map((card) => createCard(card, column.id, today)));
    body.append(list);
  }

  el.append(header, body, composer);
  return el;
}
