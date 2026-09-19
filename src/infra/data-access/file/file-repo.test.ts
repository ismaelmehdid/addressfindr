import { beforeEach, describe, expect, it, vi } from 'vitest';

// Only `db` and the drizzle-orm condition builders are faked (in-memory),
// so these tests run the real file-repo.ts code and a forgotten
// eq(file.userId, ...) filter genuinely fails them.
const fake = vi.hoisted(() => {
  type FakeRow = Record<string, unknown>;
  type FakeTable = Record<string, unknown>;
  type FakeCond =
    | { kind: 'eq'; column: unknown; value: unknown }
    | { kind: 'and'; conditions: FakeCond[] }
    | { kind: 'inArray'; column: unknown; values: unknown[] };

  const store: FakeRow[] = [];
  let nextId = 1;

  function columnKey(table: FakeTable, column: unknown): string {
    const entry = Object.entries(table).find(([, value]) => value === column);
    if (!entry) throw new Error('fake db: unmapped column in where clause');
    return entry[0];
  }

  function evalCond(table: FakeTable, row: FakeRow, cond?: FakeCond): boolean {
    if (!cond) return true;
    if (cond.kind === 'and') {
      return cond.conditions.every((sub) => evalCond(table, row, sub));
    }
    if (cond.kind === 'eq') {
      return row[columnKey(table, cond.column)] === cond.value;
    }
    return cond.values.includes(row[columnKey(table, cond.column)]);
  }

  class FakeSelect implements PromiseLike<FakeRow[]> {
    private table: FakeTable | undefined;
    private cond: FakeCond | undefined;
    private lim: number | undefined;
    private off: number | undefined;
    constructor(private readonly projection?: FakeTable) {}
    from(table: FakeTable): this {
      this.table = table;
      return this;
    }
    where(cond?: FakeCond): this {
      this.cond = cond;
      return this;
    }
    orderBy(): this {
      return this;
    }
    limit(n: number): this {
      this.lim = n;
      return this;
    }
    offset(n: number): this {
      this.off = n;
      return this;
    }
    // biome-ignore lint/suspicious/noThenProperty: mimics drizzle-orm's own thenable query builder so `await db....where()...` resolves without an explicit .execute() call.
    then<TResult1 = FakeRow[], TResult2 = never>(
      onfulfilled?:
        | ((value: FakeRow[]) => TResult1 | PromiseLike<TResult1>)
        | null,
      onrejected?:
        | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
        | null,
    ): PromiseLike<TResult1 | TResult2> {
      const table = this.table;
      if (!table) throw new Error('fake db: select() without from()');
      let rows = store.filter((row) => evalCond(table, row, this.cond));
      if (this.off) rows = rows.slice(this.off);
      if (this.lim !== undefined) rows = rows.slice(0, this.lim);
      const projection = this.projection;
      const projected = projection
        ? rows.map((row) => {
            const out: FakeRow = {};
            for (const key of Object.keys(projection)) {
              out[key] = row[columnKey(table, projection[key])];
            }
            return out;
          })
        : rows;
      return Promise.resolve(projected).then(onfulfilled, onrejected);
    }
  }

  class FakeInsert implements PromiseLike<FakeRow[]> {
    private vals: FakeRow = {};
    values(v: FakeRow): this {
      this.vals = v;
      return this;
    }
    returning(): this {
      return this;
    }
    // biome-ignore lint/suspicious/noThenProperty: mimics drizzle-orm's own thenable query builder so `await db....where()...` resolves without an explicit .execute() call.
    then<TResult1 = FakeRow[], TResult2 = never>(
      onfulfilled?:
        | ((value: FakeRow[]) => TResult1 | PromiseLike<TResult1>)
        | null,
      onrejected?:
        | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
        | null,
    ): PromiseLike<TResult1 | TResult2> {
      const now = new Date();
      const row: FakeRow = {
        id: `fake-id-${nextId++}`,
        createdAt: now,
        updatedAt: now,
        indexError: null,
        visionDescription: null,
        ...this.vals,
      };
      store.push(row);
      return Promise.resolve([row]).then(onfulfilled, onrejected);
    }
  }

  class FakeUpdate implements PromiseLike<FakeRow[]> {
    private vals: FakeRow = {};
    private cond: FakeCond | undefined;
    constructor(private readonly table: FakeTable) {}
    set(v: FakeRow): this {
      this.vals = v;
      return this;
    }
    where(cond?: FakeCond): this {
      this.cond = cond;
      return this;
    }
    returning(): this {
      return this;
    }
    // biome-ignore lint/suspicious/noThenProperty: mimics drizzle-orm's own thenable query builder so `await db....where()...` resolves without an explicit .execute() call.
    then<TResult1 = FakeRow[], TResult2 = never>(
      onfulfilled?:
        | ((value: FakeRow[]) => TResult1 | PromiseLike<TResult1>)
        | null,
      onrejected?:
        | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
        | null,
    ): PromiseLike<TResult1 | TResult2> {
      const updated: FakeRow[] = [];
      for (let i = 0; i < store.length; i += 1) {
        const row = store[i];
        if (row && evalCond(this.table, row, this.cond)) {
          const next = { ...row, ...this.vals, updatedAt: new Date() };
          store[i] = next;
          updated.push(next);
        }
      }
      return Promise.resolve(updated).then(onfulfilled, onrejected);
    }
  }

  class FakeDelete implements PromiseLike<FakeRow[]> {
    private cond: FakeCond | undefined;
    constructor(private readonly table: FakeTable) {}
    where(cond?: FakeCond): this {
      this.cond = cond;
      return this;
    }
    // biome-ignore lint/suspicious/noThenProperty: mimics drizzle-orm's own thenable query builder so `await db....where()...` resolves without an explicit .execute() call.
    then<TResult1 = FakeRow[], TResult2 = never>(
      onfulfilled?:
        | ((value: FakeRow[]) => TResult1 | PromiseLike<TResult1>)
        | null,
      onrejected?:
        | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
        | null,
    ): PromiseLike<TResult1 | TResult2> {
      const kept: FakeRow[] = [];
      const removed: FakeRow[] = [];
      for (const row of store) {
        if (evalCond(this.table, row, this.cond)) removed.push(row);
        else kept.push(row);
      }
      store.length = 0;
      store.push(...kept);
      return Promise.resolve(removed).then(onfulfilled, onrejected);
    }
  }

  const db = {
    select: (projection?: FakeTable) => new FakeSelect(projection),
    insert: () => new FakeInsert(),
    update: (table: FakeTable) => new FakeUpdate(table),
    delete: (table: FakeTable) => new FakeDelete(table),
  };

  return {
    db,
    resetStore: () => {
      store.length = 0;
      nextId = 1;
    },
  };
});

vi.mock('@/infra/database/connection', () => ({ db: fake.db }));

vi.mock('@/shared/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('drizzle-orm')>();
  return {
    ...actual,
    eq: (column: unknown, value: unknown) => ({ kind: 'eq', column, value }),
    and: (...conditions: unknown[]) => {
      const defined = conditions.filter((c) => c !== undefined);
      if (defined.length === 0) return undefined;
      if (defined.length === 1) return defined[0];
      return { kind: 'and', conditions: defined };
    },
    inArray: (column: unknown, values: unknown[]) => ({
      kind: 'inArray',
      column,
      values,
    }),
  };
});

import { FileType } from '@/core/file/types';
import {
  createFile,
  deleteFileRow,
  getFilesByIds,
  listFilesForUser,
  markUploaded,
  renameFileForUser,
  setFileVisionDescription,
} from './file-repo';

beforeEach(() => {
  fake.resetStore();
});

describe('listFilesForUser', () => {
  it('never returns a file belonging to another user', async () => {
    const a = await createFile({
      userId: 'user-a',
      originalName: 'a.pdf',
      storageKey: 'k-a',
      mimeType: 'application/pdf',
      fileType: FileType.PDF,
      sizeBytes: 1,
    });
    const b = await createFile({
      userId: 'user-b',
      originalName: 'b.pdf',
      storageKey: 'k-b',
      mimeType: 'application/pdf',
      fileType: FileType.PDF,
      sizeBytes: 1,
    });
    expect(a.isOk()).toBe(true);
    expect(b.isOk()).toBe(true);
    if (a.isErr() || b.isErr()) return;

    await markUploaded({ fileId: a.value.id, userId: 'user-a' });
    await markUploaded({ fileId: b.value.id, userId: 'user-b' });

    const result = await listFilesForUser({
      userId: 'user-a',
      page: 0,
      perPage: 10,
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    const names = result.value.items.map((f) => f.originalName);
    expect(names).toEqual(['a.pdf']);
  });
});

describe('getFilesByIds', () => {
  it('never returns a file belonging to another user', async () => {
    const a = await createFile({
      userId: 'user-a',
      originalName: 'a.pdf',
      storageKey: 'k-a',
      mimeType: 'application/pdf',
      fileType: FileType.PDF,
      sizeBytes: 1,
    });
    const b = await createFile({
      userId: 'user-b',
      originalName: 'b.pdf',
      storageKey: 'k-b',
      mimeType: 'application/pdf',
      fileType: FileType.PDF,
      sizeBytes: 1,
    });
    expect(a.isOk()).toBe(true);
    expect(b.isOk()).toBe(true);
    if (a.isErr() || b.isErr()) return;

    const result = await getFilesByIds({
      ids: [a.value.id, b.value.id],
      userId: 'user-a',
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value.map((f) => f.originalName)).toEqual(['a.pdf']);
  });
});

describe('deleteFileRow', () => {
  it('does not delete a file belonging to another user', async () => {
    const b = await createFile({
      userId: 'user-b',
      originalName: 'b.pdf',
      storageKey: 'k-b',
      mimeType: 'application/pdf',
      fileType: FileType.PDF,
      sizeBytes: 1,
    });
    expect(b.isOk()).toBe(true);
    if (b.isErr()) return;

    await deleteFileRow({ fileId: b.value.id, userId: 'user-a' });

    const stillThere = await getFilesByIds({
      ids: [b.value.id],
      userId: 'user-b',
    });
    expect(stillThere.isOk()).toBe(true);
    if (stillThere.isErr()) return;
    expect(stillThere.value).toHaveLength(1);
  });
});

describe('renameFileForUser', () => {
  it('does not rename a file belonging to another user', async () => {
    const b = await createFile({
      userId: 'user-b',
      originalName: 'b.pdf',
      storageKey: 'k-b',
      mimeType: 'application/pdf',
      fileType: FileType.PDF,
      sizeBytes: 1,
    });
    expect(b.isOk()).toBe(true);
    if (b.isErr()) return;

    const renamed = await renameFileForUser({
      fileId: b.value.id,
      userId: 'user-a',
      originalName: 'hacked.pdf',
    });
    expect(renamed.isErr()).toBe(true);

    const stillThere = await getFilesByIds({
      ids: [b.value.id],
      userId: 'user-b',
    });
    expect(stillThere.isOk()).toBe(true);
    if (stillThere.isErr()) return;
    expect(stillThere.value[0]?.originalName).toBe('b.pdf');
  });
});

describe('setFileVisionDescription', () => {
  it('does not set a vision description on a file belonging to another user', async () => {
    const b = await createFile({
      userId: 'user-b',
      originalName: 'b.png',
      storageKey: 'k-b',
      mimeType: 'image/png',
      fileType: FileType.PNG,
      sizeBytes: 1,
    });
    expect(b.isOk()).toBe(true);
    if (b.isErr()) return;

    await setFileVisionDescription({
      fileId: b.value.id,
      userId: 'user-a',
      visionDescription: 'hacked description',
    });

    const stillThere = await getFilesByIds({
      ids: [b.value.id],
      userId: 'user-b',
    });
    expect(stillThere.isOk()).toBe(true);
    if (stillThere.isErr()) return;
    expect(stillThere.value[0]?.visionDescription).toBeNull();
  });
});
