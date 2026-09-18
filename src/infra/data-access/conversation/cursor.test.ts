import { describe, expect, it } from 'vitest';
import { buildCursor, dropBeforeCursor, type RawMessage } from './cursor';

function row(id: string, isoCreatedAt: string): RawMessage {
  return { id, createdAt: new Date(isoCreatedAt) };
}

describe('dropBeforeCursor', () => {
  it('keeps rows strictly older by createdAt', () => {
    const rows = [
      row('a', '2026-01-01T00:00:00.000Z'),
      row('b', '2026-01-02T00:00:00.000Z'),
    ];
    const out = dropBeforeCursor(rows, {
      createdAt: '2026-01-02T00:00:00.000Z',
      id: 'b',
    });
    expect(out.map((r) => r.id)).toEqual(['a']);
  });

  it('drops the cursor row itself', () => {
    const rows = [row('cursor', '2026-01-01T00:00:00.000Z')];
    const out = dropBeforeCursor(rows, {
      createdAt: '2026-01-01T00:00:00.000Z',
      id: 'cursor',
    });
    expect(out).toEqual([]);
  });

  it('keeps same-ms rows whose id sorts before the cursor id', () => {
    const rows = [
      row('a', '2026-01-01T00:00:00.000Z'),
      row('b', '2026-01-01T00:00:00.000Z'),
      row('c', '2026-01-01T00:00:00.000Z'),
    ];
    const out = dropBeforeCursor(rows, {
      createdAt: '2026-01-01T00:00:00.000Z',
      id: 'b',
    });
    expect(out.map((r) => r.id)).toEqual(['a']);
  });

  it('drops same-ms rows whose id sorts after the cursor id', () => {
    const rows = [
      row('a', '2026-01-01T00:00:00.000Z'),
      row('b', '2026-01-01T00:00:00.000Z'),
    ];
    const out = dropBeforeCursor(rows, {
      createdAt: '2026-01-01T00:00:00.000Z',
      id: 'a',
    });
    expect(out).toEqual([]);
  });

  it('returns empty when no rows match', () => {
    expect(
      dropBeforeCursor([], {
        createdAt: '2026-01-01T00:00:00.000Z',
        id: 'x',
      }),
    ).toEqual([]);
  });
});

describe('buildCursor', () => {
  it('returns null for undefined row', () => {
    expect(buildCursor(undefined)).toBeNull();
  });

  it('serializes createdAt as ISO and keeps id', () => {
    const r = row('x', '2026-05-22T10:30:00.000Z');
    expect(buildCursor(r)).toEqual({
      createdAt: '2026-05-22T10:30:00.000Z',
      id: 'x',
    });
  });
});
