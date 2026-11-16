import { describe, expect, it } from 'vitest';
import { addCard, emptyBoard, moveCard, type Board } from '../model';
import { announce, cancelGrab, dropGrab, grabCard, moveGrab, previewBoard, type Direction, type Grab } from './keyboard';

/** To do: a b c; Doing: d; Done: (empty). */
function sample(): Board {
  let board = emptyBoard();
  for (const [column, id] of [['todo', 'a'], ['todo', 'b'], ['todo', 'c'], ['doing', 'd']] as const) {
    board = addCard(board, column, { id, title: id.toUpperCase() });
  }
  return board;
}

const ids = (board: Board, column: string) =>
  board.columns.find((c) => c.id === column)?.cards.map((c) => c.id);

function grabbed(board: Board, id: string): Grab {
  const grab = grabCard(board, id);
  if (!grab) throw new Error(`no card ${id}`);
  return grab;
}

/** Applies the directions one after the other; the board itself is never changed. */
function press(board: Board, grab: Grab, ...directions: Direction[]): Grab {
  return directions.reduce((g, d) => moveGrab(board, g, d), grab);
}

describe('grabCard', () => {
  it('starts at the card’s column and index, with the origin remembered', () => {
    const grab = grabbed(sample(), 'b');
    expect(grab).toEqual({ cardId: 'b', origin: { columnId: 'todo', index: 1 }, position: { columnId: 'todo', index: 1 } });
  });

  it('is null for an unknown card', () => {
    expect(grabCard(sample(), 'nope')).toBeNull();
  });
});

describe('moveGrab', () => {
  const board = sample();

  it('moves up and down within the column', () => {
    expect(press(board, grabbed(board, 'b'), 'up').position).toEqual({ columnId: 'todo', index: 0 });
    expect(press(board, grabbed(board, 'b'), 'down').position).toEqual({ columnId: 'todo', index: 2 });
  });

  it('stops at the top and bottom of the column, returning the same grab', () => {
    const top = grabbed(board, 'a');
    expect(moveGrab(board, top, 'up')).toBe(top);
    const bottom = press(board, grabbed(board, 'c'), 'down');
    expect(bottom.position.index).toBe(2); // the last place among the other two cards
    expect(moveGrab(board, bottom, 'down')).toBe(bottom);
  });

  it('changes column with left and right, keeping the index where the column has room', () => {
    const toDoing = moveGrab(board, grabbed(board, 'a'), 'right');
    expect(toDoing.position).toEqual({ columnId: 'doing', index: 0 });
    expect(press(board, grabbed(board, 'b'), 'right').position).toEqual({ columnId: 'doing', index: 1 });
  });

  it('clamps the index to the length of the target column', () => {
    // c is at index 2 of To do; Doing has one card, Done none.
    expect(press(board, grabbed(board, 'c'), 'right').position).toEqual({ columnId: 'doing', index: 1 });
    expect(press(board, grabbed(board, 'c'), 'right', 'right').position).toEqual({ columnId: 'done', index: 0 });
    // and back: the index is not remembered from before the clamp
    expect(press(board, grabbed(board, 'c'), 'right', 'right', 'left').position).toEqual({ columnId: 'doing', index: 0 });
  });

  it('does not move left of the first column or right of the last', () => {
    const first = grabbed(board, 'a');
    expect(moveGrab(board, first, 'left')).toBe(first);
    const last = press(board, grabbed(board, 'a'), 'right', 'right');
    expect(moveGrab(board, last, 'right')).toBe(last);
  });

  it('does not count the grabbed card itself in its own column', () => {
    // Moving right then left: To do has two other cards, so the last place is 2, not 3.
    const back = press(board, grabbed(board, 'a'), 'right', 'down', 'left', 'down', 'down', 'down');
    expect(back.position).toEqual({ columnId: 'todo', index: 2 });
  });

  it('leaves the saved board and the origin alone', () => {
    const grab = press(board, grabbed(board, 'a'), 'right', 'down');
    expect(ids(board, 'todo')).toEqual(['a', 'b', 'c']);
    expect(grab.origin).toEqual({ columnId: 'todo', index: 0 });
  });
});

describe('previewBoard, dropGrab and cancelGrab', () => {
  const board = sample();

  it('shows what moveCard does with the position, for every step', () => {
    let grab = grabbed(board, 'a');
    for (const direction of ['right', 'down', 'right', 'up', 'left', 'down'] as const) {
      grab = moveGrab(board, grab, direction);
      expect(previewBoard(board, grab)).toEqual(moveCard(board, 'a', grab.position.columnId, grab.position.index));
    }
  });

  it('the preview of a grab that has not moved is the saved board', () => {
    expect(previewBoard(board, grabbed(board, 'b'))).toBe(board);
  });

  it('a drop is where the card is now', () => {
    const grab = press(board, grabbed(board, 'a'), 'right', 'down');
    expect(dropGrab(grab)).toEqual({ columnId: 'doing', index: 1 });
    expect(ids(previewBoard(board, grab), 'doing')).toEqual(['d', 'a']);
  });

  it('a cancel is where the card started, however far it moved', () => {
    const grab = press(board, grabbed(board, 'b'), 'right', 'right', 'up');
    expect(cancelGrab(grab)).toEqual({ columnId: 'todo', index: 1 });
  });
});

describe('announcements', () => {
  const board = sample();

  it('says what was grabbed, where it is and how to go on', () => {
    expect(announce.grabbed(board, grabbed(board, 'b'))).toBe(
      'Grabbed B. Currently in To do, position 2 of 3. Use arrow keys to move, Space to drop, Escape to cancel',
    );
  });

  it('gives the new column and place after a move, counting the card in the target column', () => {
    const grab = press(board, grabbed(board, 'a'), 'right', 'down');
    expect(announce.moved(board, grab)).toBe('A moved to Doing, position 2 of 2');
    expect(announce.moved(board, press(board, grabbed(board, 'a'), 'right', 'right'))).toBe(
      'A moved to Done, position 1 of 1',
    );
  });

  it('says where the card was dropped, and where it went back to on a cancel', () => {
    const grab = press(board, grabbed(board, 'b'), 'right');
    expect(announce.dropped(board, grab)).toBe('Dropped B in Doing, position 2 of 2');
    expect(announce.cancelled(board, grab)).toBe('Move cancelled. B is back in To do, position 2 of 3');
  });
});
