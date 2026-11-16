// Where a dragged card would land. Pure: it works on numbers (viewport coordinates and the
// rectangles of the columns and cards), never on the DOM, so it is easy to test.

import type { ColumnId } from '../model';

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface ColumnBox {
  id: ColumnId;
  /** The whole column panel: the area where a drop counts for this column. */
  rect: Rect;
  /** The scrolling card area. An empty column has only this, no card list. */
  body: Rect;
  /** The column's cards in order, including the dragged card. */
  cards: { id: string; rect: Rect }[];
}

/** The column and the card's FINAL index in it once it is taken out of its old place (as `moveCard` expects). */
export interface DropTarget {
  columnId: ColumnId;
  index: number;
}

/** Half the 8 px gap between cards: the indicator line sits in the middle of the gap. */
const HALF_GAP = 4;

/** The column under the point, or null when the point is outside every column. */
function columnAt(x: number, y: number, columns: ColumnBox[]): ColumnBox | null {
  return (
    columns.find((c) => x >= c.rect.left && x < c.rect.right && y >= c.rect.top && y < c.rect.bottom) ?? null
  );
}

/** The other cards of the column: the dragged card does not count, so the index is a final one. */
function others(column: ColumnBox, draggedId: string) {
  return column.cards.filter((c) => c.id !== draggedId);
}

/**
 * The drop target for a pointer at (x, y): the column under it, and the number of other cards
 * whose middle is above it. A pointer above a column's cards gives 0, below them all gives the
 * count. Returns null outside every column.
 */
export function findDropTarget(x: number, y: number, columns: ColumnBox[], draggedId: string): DropTarget | null {
  const column = columnAt(x, y, columns);
  if (!column) return null;
  const index = others(column, draggedId).filter((c) => (c.rect.top + c.rect.bottom) / 2 < y).length;
  return { columnId: column.id, index };
}

/**
 * The viewport y of the indicator line for `target`: in the gap above the card that will come
 * after the dragged one, or below the last card; near the top of an empty column. Kept inside
 * the column's visible card area.
 */
export function indicatorTop(target: DropTarget, columns: ColumnBox[], draggedId: string): number {
  const column = columns.find((c) => c.id === target.columnId);
  if (!column) return 0;
  const rest = others(column, draggedId);
  const next = rest[target.index];
  const previous = rest[target.index - 1];
  const y = next ? next.rect.top - HALF_GAP : previous ? previous.rect.bottom + HALF_GAP : column.body.top + HALF_GAP;
  return Math.min(Math.max(y, column.body.top), column.body.bottom);
}
