import { beforeEach, describe, expect, it, vi } from 'vitest';

// Only `db` and the drizzle-orm condition builders are faked (in-memory), so
// these tests run the real repository code: a missing verdict filter on the
// detail update, or an insert that overwrites, genuinely fails them.
const fake = vi.hoisted(() => {
  type FakeRow = Record<string, unknown>;
  type FakeTable = Record<string, unknown>;
  type FakeCond =
    | { kind: 'eq'; column: unknown; value: unknown }
    | { kind: 'and'; conditions: FakeCond[] };

  const store: FakeRow[] = [];
  const state: { nextId: number; failure: Error | null } = {
    nextId: 1,
    failure: null,
  };

  function columnKey(table: FakeTable, column: unknown): string {
    const entry = Object.entries(table).find(([, value]) => value === column);
    if (!entry) throw new Error('fake db: unmapped column');
    return entry[0];
  }

  function matches(table: FakeTable, row: FakeRow, cond?: FakeCond): boolean {
    if (!cond) return true;
    if (cond.kind === 'and') {
      return cond.conditions.every((sub) => matches(table, row, sub));
    }
    return row[columnKey(table, cond.column)] === cond.value;
  }

  function guard(): void {
    if (state.failure) throw state.failure;
  }

  class FakeQuery implements PromiseLike<FakeRow[]> {
    constructor(private readonly run: () => FakeRow[]) {}
    // biome-ignore lint/suspicious/noThenProperty: mimics drizzle-orm's thenable query builder.
    then<TResult1 = FakeRow[], TResult2 = never>(
      onfulfilled?:
        | ((value: FakeRow[]) => TResult1 | PromiseLike<TResult1>)
        | null,
      onrejected?:
        | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
        | null,
    ): PromiseLike<TResult1 | TResult2> {
      return new Promise<FakeRow[]>((resolve) => {
        guard();
        resolve(this.run());
      }).then(onfulfilled, onrejected);
    }
  }

  const db = {
    select: () => ({
      from: (table: FakeTable) => ({
        where: (cond?: FakeCond) => ({
          limit: (n: number) =>
            new FakeQuery(() =>
              store.filter((row) => matches(table, row, cond)).slice(0, n),
            ),
        }),
      }),
    }),
    insert: (table: FakeTable) => ({
      values: (values: FakeRow) => ({
        onConflictDoNothing: ({ target }: { target: unknown }) => ({
          returning: () =>
            new FakeQuery(() => {
              const key = columnKey(table, target);
              if (store.some((row) => row[key] === values[key])) return [];
              const now = new Date();
              const row: FakeRow = {
                id: `feedback-${state.nextId++}`,
                reason: null,
                comment: null,
                createdAt: now,
                updatedAt: now,
                ...values,
              };
              store.push(row);
              return [row];
            }),
        }),
      }),
    }),
    update: (table: FakeTable) => ({
      set: (values: FakeRow) => ({
        where: (cond?: FakeCond) => ({
          returning: () =>
            new FakeQuery(() => {
              const updated: FakeRow[] = [];
              for (let i = 0; i < store.length; i += 1) {
                const row = store[i];
                if (row && matches(table, row, cond)) {
                  const next = { ...row, ...values, updatedAt: new Date() };
                  store[i] = next;
                  updated.push(next);
                }
              }
              return updated;
            }),
        }),
      }),
    }),
  };

  return {
    db,
    store,
    reset: () => {
      store.length = 0;
      state.nextId = 1;
      state.failure = null;
    },
    fail: (error = new Error('fake db: connection reset')) => {
      state.failure = error;
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
    and: (...conditions: unknown[]) => ({
      kind: 'and',
      conditions: conditions.filter((c) => c !== undefined),
    }),
  };
});

import { FEEDBACK_REASONS, FEEDBACK_VERDICTS } from '@/core/listing/feedback';
import {
  listingFeedbackReason,
  listingFeedbackVerdict,
} from '@/infra/database/schema/listing-feedback-schema';
import { log } from '@/shared/logger';
import { listingFeedbackRepository } from './listing-feedback-repository';

const SEARCH_ID = '6f1c2a4e-8d3b-4c5a-9e7f-0a1b2c3d4e5f';
const LISTING_URL =
  'https://www.leboncoin.fr/ad/ventes_immobilieres/3132785420';
const CANDIDATES = [
  { dpeNumber: '2269E0123456A', score: 0.93 },
  { dpeNumber: '2269E0999999B', score: 0.71 },
];

function confirmation(dpeNumber: string) {
  return {
    searchId: SEARCH_ID,
    listingUrl: LISTING_URL,
    verdict: 'confirmed' as const,
    confirmedDpeNumber: dpeNumber,
    candidates: CANDIDATES,
  };
}

const NONE_MATCH = {
  searchId: SEARCH_ID,
  listingUrl: LISTING_URL,
  verdict: 'none_match' as const,
  confirmedDpeNumber: null,
  candidates: CANDIDATES,
};

// A DrizzleQueryError's message carries the query params, the free-text
// comment included; its cause is the PostgresError.
function queryError(params: string): Error {
  const cause = Object.assign(new Error('value too long for type'), {
    name: 'PostgresError',
    code: '22001',
  });
  return new Error(`Failed query: <sql>\nparams: ${params}`, { cause });
}

beforeEach(() => {
  fake.reset();
  vi.clearAllMocks();
});

describe('listing feedback enums', () => {
  it('mirror the verdicts and reasons of core/listing/feedback', () => {
    expect(listingFeedbackVerdict.enumValues).toEqual([...FEEDBACK_VERDICTS]);
    expect(listingFeedbackReason.enumValues).toEqual([...FEEDBACK_REASONS]);
  });
});

describe('listingFeedbackRepository.saveVerdict', () => {
  it('stores a first verdict and maps the row', async () => {
    const saved = await listingFeedbackRepository.saveVerdict(
      confirmation('2269E0123456A'),
    );

    expect(saved.isOk()).toBe(true);
    if (saved.isErr()) return;
    expect(saved.value.inserted).toBe(true);
    expect(saved.value.feedback).toMatchObject({
      searchId: SEARCH_ID,
      listingUrl: LISTING_URL,
      verdict: 'confirmed',
      confirmedDpeNumber: '2269E0123456A',
      reason: null,
      comment: null,
      candidates: CANDIDATES,
    });
    expect(fake.store).toHaveLength(1);
  });

  it('returns the stored row untouched when the search already has a verdict', async () => {
    await listingFeedbackRepository.saveVerdict(confirmation('2269E0123456A'));

    const again = await listingFeedbackRepository.saveVerdict(NONE_MATCH);

    expect(again.isOk()).toBe(true);
    if (again.isErr()) return;
    expect(again.value.inserted).toBe(false);
    expect(again.value.feedback.verdict).toBe('confirmed');
    expect(again.value.feedback.confirmedDpeNumber).toBe('2269E0123456A');
    expect(fake.store).toHaveLength(1);
  });

  it('refuses a stored row whose candidates are malformed', async () => {
    fake.store.push({
      id: 'feedback-corrupt',
      searchId: SEARCH_ID,
      listingUrl: LISTING_URL,
      verdict: 'none_match',
      confirmedDpeNumber: null,
      reason: null,
      comment: null,
      candidates: [{ dpeNumber: 42 }],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const saved = await listingFeedbackRepository.saveVerdict(NONE_MATCH);

    expect(saved.isErr()).toBe(true);
    if (saved.isOk()) return;
    expect(saved.error.code).toBe('unknown');
  });

  it('returns a db_error when the database fails', async () => {
    fake.fail();

    const saved = await listingFeedbackRepository.saveVerdict(NONE_MATCH);

    expect(saved.isErr()).toBe(true);
    if (saved.isOk()) return;
    expect(saved.error.code).toBe('db_error');
  });

  it('logs only the Postgres code and name of a failed insert', async () => {
    fake.fail(queryError(`${SEARCH_ID},${LISTING_URL}`));

    const saved = await listingFeedbackRepository.saveVerdict(NONE_MATCH);

    expect(saved.isErr()).toBe(true);
    if (saved.isOk()) return;
    expect(saved.error.message).not.toContain(LISTING_URL);
    expect(log.error).toHaveBeenCalledTimes(1);
    expect(log.error).toHaveBeenCalledWith(
      'listing.feedback.repository.save_verdict_crashed',
      undefined,
      { searchId: SEARCH_ID, code: '22001', name: 'PostgresError' },
    );
  });
});

describe('listingFeedbackRepository.saveDetail', () => {
  it('completes a none_match verdict with its reason and comment', async () => {
    await listingFeedbackRepository.saveVerdict(NONE_MATCH);

    const saved = await listingFeedbackRepository.saveDetail({
      searchId: SEARCH_ID,
      reason: 'wrong_commune',
      comment: 'La maison est à Melesse.',
    });

    expect(saved.isOk()).toBe(true);
    if (saved.isErr()) return;
    expect(saved.value.kind).toBe('saved');
    expect(fake.store[0]).toMatchObject({
      reason: 'wrong_commune',
      comment: 'La maison est à Melesse.',
    });
  });

  it('never writes a detail onto a confirmation', async () => {
    await listingFeedbackRepository.saveVerdict(confirmation('2269E0123456A'));

    const saved = await listingFeedbackRepository.saveDetail({
      searchId: SEARCH_ID,
      reason: 'unsure',
      comment: null,
    });

    expect(saved.isOk()).toBe(true);
    if (saved.isErr()) return;
    expect(saved.value).toEqual({
      kind: 'other_verdict',
      verdict: 'confirmed',
    });
    expect(fake.store[0]).toMatchObject({ reason: null, comment: null });
  });

  it('reports a search that has no verdict', async () => {
    const saved = await listingFeedbackRepository.saveDetail({
      searchId: SEARCH_ID,
      reason: 'unsure',
      comment: null,
    });

    expect(saved.isOk()).toBe(true);
    if (saved.isErr()) return;
    expect(saved.value).toEqual({ kind: 'no_verdict' });
  });

  it('returns a db_error when the database fails', async () => {
    fake.fail();

    const saved = await listingFeedbackRepository.saveDetail({
      searchId: SEARCH_ID,
      reason: 'unsure',
      comment: null,
    });

    expect(saved.isErr()).toBe(true);
    if (saved.isOk()) return;
    expect(saved.error.code).toBe('db_error');
  });

  it('never logs or returns the comment of a failed update', async () => {
    const comment = 'La maison est à Melesse.';
    fake.fail(queryError(`unsure,${comment},${SEARCH_ID}`));

    const saved = await listingFeedbackRepository.saveDetail({
      searchId: SEARCH_ID,
      reason: 'unsure',
      comment,
    });

    expect(saved.isErr()).toBe(true);
    if (saved.isOk()) return;
    expect(saved.error.message).not.toContain(comment);
    expect(log.error).toHaveBeenCalledTimes(1);
    expect(log.error).toHaveBeenCalledWith(
      'listing.feedback.repository.save_detail_crashed',
      undefined,
      { searchId: SEARCH_ID, code: '22001', name: 'PostgresError' },
    );
  });
});
