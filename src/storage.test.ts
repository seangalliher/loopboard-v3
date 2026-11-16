import { describe, expect, it } from 'vitest';
import { addCard, emptyBoard, MAX_NOTE_LENGTH, MAX_TITLE_LENGTH, type Board } from './model';
import {
  exportJson,
  loadBoard,
  parseBoard,
  sampleBoard,
  saveBoard,
  STORAGE_KEY,
  type StorageLike,
} from './storage';

function fakeStorage(initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v;
    },
  };
}

function sample(): Board {
  let b = emptyBoard();
  b = addCard(b, 'todo', { id: 'a', title: 'One', note: 'n', due: '2026-02-28' });
  b = addCard(b, 'done', { id: 'b', title: 'Two' });
  return { ...b, columns: b.columns.map((c) => (c.id === 'doing' ? { ...c, wipLimit: 3 } : c)) };
}

interface RawColumn {
  id: unknown;
  title: unknown;
  wipLimit: unknown;
  cards: Record<string, unknown>[];
}
interface RawBoard {
  version: unknown;
  columns: RawColumn[];
  [key: string]: unknown;
}

/** A plain object copy of a valid board that a test can damage (fields are typed loosely on purpose). */
function raw(): RawBoard {
  return JSON.parse(exportJson(sample())) as RawBoard;
}

function rejected(input: unknown, fragment: string): void {
  const result = parseBoard(input);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error).toContain(fragment);
}

describe('round trip', () => {
  it('saves then loads an equal board', () => {
    const storage = fakeStorage();
    expect(saveBoard(sample(), storage)).toEqual({ ok: true });
    expect(storage.data[STORAGE_KEY]).toBeDefined();
    expect(loadBoard(storage)).toEqual(sample());
  });

  it('exportJson then parseBoard returns an equal board, from text or a parsed value', () => {
    const text = exportJson(sample());
    expect(parseBoard(text)).toEqual({ ok: true, board: sample() });
    expect(parseBoard(JSON.parse(text))).toEqual({ ok: true, board: sample() });
  });

  it('accepts a board with no cards', () => {
    expect(parseBoard(exportJson(emptyBoard()))).toEqual({ ok: true, board: emptyBoard() });
  });
});

describe('parseBoard rejects', () => {
  it('non-JSON text', () => rejected('{not json', 'not valid JSON'));
  it('non-object values', () => {
    rejected('[]', 'JSON object');
    rejected('null', 'JSON object');
    rejected(42, 'JSON object');
    rejected(undefined, 'JSON object');
  });
  it('a wrong version', () => {
    const b = raw();
    b.version = 2;
    rejected(b, 'version');
  });
  it('a missing column', () => {
    const b = raw();
    b.columns.pop();
    rejected(b, 'Missing column id: done');
  });
  it('an extra column', () => {
    const b = raw();
    b.columns.push({ id: 'later', title: 'Later', wipLimit: null, cards: [] });
    rejected(b, 'columns[3].id');
  });
  it('a duplicate column id', () => {
    const b = raw();
    b.columns[2].id = 'doing';
    rejected(b, 'Duplicate column id "doing"');
  });
  it('columns that are not an array', () => {
    const b = raw();
    b.columns = {} as unknown as RawColumn[];
    rejected(b, 'columns must be an array');
  });
  it('a non-string card id', () => {
    const b = raw();
    b.columns[0].cards[0].id = 5;
    rejected(b, 'columns[0].cards[0].id must be a string');
  });
  it('a non-string title', () => {
    const b = raw();
    b.columns[0].cards[0].title = 5;
    rejected(b, 'columns[0].cards[0].title must be a string');
  });
  it('an empty title', () => {
    const b = raw();
    b.columns[0].cards[0].title = '   ';
    rejected(b, 'title must not be empty');
  });
  it('a non-string note', () => {
    const b = raw();
    b.columns[0].cards[0].note = null;
    rejected(b, 'note must be a string');
  });
  it.each([0, -1, 1.5, '3', NaN, undefined])('wipLimit %s', (limit) => {
    const b = raw();
    b.columns[1].wipLimit = limit;
    rejected(b, 'columns[1].wipLimit');
  });
  it.each(['2026-13-01', '2026-02-30', '26-01-01', '', 'tomorrow', 20260101, undefined])('due %s', (due) => {
    const b = raw();
    b.columns[0].cards[0].due = due;
    rejected(b, 'cards[0].due');
  });
  it('duplicate card ids, within and across columns', () => {
    const b = raw();
    b.columns[2].cards[0].id = 'a';
    rejected(b, 'duplicate card id');
    const c = raw();
    c.columns[0].cards.push({ ...c.columns[0].cards[0] });
    rejected(c, 'duplicate card id');
  });
  it('oversized strings, but accepts the limits themselves', () => {
    const long = (n: number) => 'x'.repeat(n);
    const title = raw();
    title.columns[0].cards[0].title = long(MAX_TITLE_LENGTH + 1);
    rejected(title, 'title is longer than 200');
    const note = raw();
    note.columns[0].cards[0].note = long(MAX_NOTE_LENGTH + 1);
    rejected(note, 'note is longer than 2000');
    const ok = raw();
    ok.columns[0].cards[0].title = long(MAX_TITLE_LENGTH);
    ok.columns[0].cards[0].note = long(MAX_NOTE_LENGTH);
    expect(parseBoard(ok).ok).toBe(true);
  });
  it('a column or card that is not an object', () => {
    const b = raw();
    b.columns[0] = 'todo' as unknown as RawColumn;
    rejected(b, 'columns[0] must be an object');
    const c = raw();
    c.columns[0].cards[0] = null as unknown as Record<string, unknown>;
    rejected(c, 'cards[0] must be an object');
  });
});

describe('parseBoard keeps text as text', () => {
  it('returns markup and script-like strings unchanged and drops unknown fields', () => {
    const b = raw();
    b.columns[0].cards[0].title = '<img src=x onerror=alert(1)>';
    b.columns[0].cards[0].note = '${process.exit()} __proto__';
    b.columns[0].cards[0].extra = () => 1;
    b.extra = 'x';
    const result = parseBoard(JSON.stringify(b));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const card = result.board.columns[0].cards[0];
    expect(card.title).toBe('<img src=x onerror=alert(1)>');
    expect(card.note).toBe('${process.exit()} __proto__');
    expect(Object.keys(card)).toEqual(['id', 'title', 'note', 'due']);
    expect(Object.keys(result.board)).toEqual(['version', 'columns']);
  });

  it('does not pollute prototypes through a __proto__ key', () => {
    const text = '{"__proto__":{"polluted":true},"version":1,"columns":[]}';
    parseBoard(text);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('loadBoard', () => {
  it('gives three sample cards, one per column, when nothing is stored', () => {
    const board = loadBoard(fakeStorage());
    expect(board).toEqual(sampleBoard());
    expect(board.columns.map((c) => c.cards.length)).toEqual([1, 1, 1]);
    expect(parseBoard(exportJson(board)).ok).toBe(true);
  });

  it('falls back to the sample board for corrupt or invalid stored data', () => {
    expect(loadBoard(fakeStorage({ [STORAGE_KEY]: '{oops' }))).toEqual(sampleBoard());
    expect(loadBoard(fakeStorage({ [STORAGE_KEY]: '{"version":2,"columns":[]}' }))).toEqual(sampleBoard());
  });

  it('keeps a stored board with all cards deleted', () => {
    const storage = fakeStorage();
    saveBoard(emptyBoard(), storage);
    expect(loadBoard(storage)).toEqual(emptyBoard());
  });

  it('falls back when reading storage throws', () => {
    const denied: StorageLike = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {},
    };
    expect(loadBoard(denied)).toEqual(sampleBoard());
  });
});

describe('saveBoard', () => {
  it.each([new DOMException('quota', 'QuotaExceededError'), new Error('denied'), 'boom'])(
    'returns an error instead of throwing when storage throws %s',
    (thrown) => {
      const failing: StorageLike = {
        getItem: () => null,
        setItem: () => {
          throw thrown;
        },
      };
      const result = saveBoard(sample(), failing);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain('Could not save');
    },
  );

  it('returns an error instead of throwing when there is no localStorage', () => {
    // Vitest runs in node here, where localStorage does not exist.
    expect(typeof localStorage).toBe('undefined');
    expect(saveBoard(sample()).ok).toBe(false);
  });
});
