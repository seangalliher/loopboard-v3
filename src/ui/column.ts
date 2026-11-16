import { CircleCheck, Ellipsis, Gauge, Inbox, Timer, TriangleAlert, type IconNode } from 'lucide';
import { isOverLimit, type Column, type ColumnId } from '../model';
import { createCard, type CardActions } from './card';
import { icon } from './icon';
import { createMenu } from './menu';

const EMPTY_STATES: Record<ColumnId, { icon: IconNode; hint: string }> = {
  todo: { icon: Inbox, hint: 'Nothing planned yet. Add a card to get started.' },
  doing: { icon: Timer, hint: 'Nothing in progress. Move a card here when you start it.' },
  done: { icon: CircleCheck, hint: 'Finished work will show up here.' },
};

/** What a column needs besides its data: the pieces that live outside the redraw, and the actions. */
export interface ColumnParts {
  /** The add-card button and form, at the foot. */
  composer: HTMLElement;
  /** The WIP limit panel, shown under the header while it is open. */
  wipForm: HTMLElement;
  /** An open edit form, shown in place of the card with this id. */
  editing: { cardId: string; element: HTMLElement } | null;
  onSetWipLimit: () => void;
  cardActions: CardActions;
}

/**
 * One column panel: accent dot, name, count badge (`count / limit` once a limit is set) and a
 * "…" menu in the header, a warning line when over the limit, the cards (or an empty-state hint)
 * and the composer (the add-card button and form) at the foot.
 */
export function createColumn(column: Column, today: Date, parts: ColumnParts): HTMLElement {
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

  const over = isOverLimit(column);
  const count = document.createElement('span');
  count.className = over ? 'badge is-over' : 'badge';
  count.append(column.wipLimit === null ? String(column.cards.length) : `${column.cards.length} / ${column.wipLimit}`);
  const unit = document.createElement('span');
  unit.className = 'sr-only';
  unit.textContent = column.cards.length === 1 ? ' card' : ' cards';
  count.append(unit);

  const anchor = document.createElement('div');
  anchor.className = 'menu-anchor column-actions';
  const menuButton = document.createElement('button');
  menuButton.type = 'button';
  menuButton.className = 'btn btn-icon';
  menuButton.dataset.columnMenu = '';
  menuButton.setAttribute('aria-label', `Column actions: ${column.title}`);
  menuButton.title = 'Column actions';
  menuButton.append(icon(Ellipsis, 16));
  anchor.append(menuButton);
  createMenu(menuButton, [{ label: 'Set WIP limit…', icon: Gauge, onSelect: parts.onSetWipLimit }]);

  header.append(dot, name, count, anchor);

  const nodes: Node[] = [header];
  if (over) {
    const warning = document.createElement('p');
    warning.className = 'wip-warning';
    const text = document.createElement('span');
    text.textContent = `Over the limit: ${column.cards.length} of ${column.wipLimit}`;
    warning.append(icon(TriangleAlert, 16), text);
    nodes.push(warning);
  }
  nodes.push(parts.wipForm);

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
    list.append(
      ...column.cards.map((card) =>
        parts.editing?.cardId === card.id
          ? parts.editing.element
          : createCard(card, column.id, today, parts.cardActions),
      ),
    );
    body.append(list);
  }

  el.append(...nodes, body, parts.composer);
  return el;
}
