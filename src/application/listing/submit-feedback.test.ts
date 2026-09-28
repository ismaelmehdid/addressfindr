import { err, ok } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock(
  '@/infra/data-access/listing-feedback/listing-feedback-repository',
  () => ({ listingFeedbackRepository: {} }),
);

import type { AppError } from '@/core/errors';
import type { StoredFeedback } from '@/core/listing/feedback';
import type {
  IListingFeedbackRepository,
  NewFeedbackVerdict,
} from '@/core/listing/ports/listing-feedback-repository.port';
import type { SubmitFeedbackInput } from './feedback-dto';
import { submitFeedback } from './submit-feedback';

// why: mirrors the real repository contract (ON CONFLICT DO NOTHING, then
// read back), so these tests exercise the use case's own replay decision.
function inMemoryRepository(): IListingFeedbackRepository & {
  rows: Map<string, StoredFeedback>;
  calls: NewFeedbackVerdict[];
} {
  const rows = new Map<string, StoredFeedback>();
  const calls: NewFeedbackVerdict[] = [];
  return {
    rows,
    calls,
    async saveVerdict(input) {
      calls.push(input);
      const existing = rows.get(input.searchId);
      if (existing) return ok({ feedback: existing, inserted: false });
      const now = new Date();
      const feedback: StoredFeedback = {
        id: `feedback-${rows.size + 1}`,
        searchId: input.searchId,
        listingUrl: input.listingUrl,
        verdict: input.verdict,
        confirmedDpeNumber: input.confirmedDpeNumber,
        reason: null,
        comment: null,
        candidates: input.candidates,
        createdAt: now,
        updatedAt: now,
      };
      rows.set(input.searchId, feedback);
      return ok({ feedback, inserted: true });
    },
    async saveDetail() {
      return ok({ kind: 'no_verdict' });
    },
  };
}

const SEARCH_ID = '6f1c2a4e-8d3b-4c5a-9e7f-0a1b2c3d4e5f';
const CANDIDATES = [
  { dpeNumber: '2269E0123456A', score: 0.93 },
  { dpeNumber: '2269E0999999B', score: 0.71 },
];

function confirmation(
  over: Partial<SubmitFeedbackInput> = {},
): SubmitFeedbackInput {
  return {
    searchId: SEARCH_ID,
    listingUrl:
      'https://www.leboncoin.fr/ad/ventes_immobilieres/3132785420?utm_source=share',
    verdict: 'confirmed',
    confirmedDpeNumber: '2269E0123456A',
    candidates: CANDIDATES,
    ...over,
  };
}

function noneMatch(
  over: Partial<SubmitFeedbackInput> = {},
): SubmitFeedbackInput {
  return {
    searchId: SEARCH_ID,
    listingUrl: 'https://www.leboncoin.fr/ad/ventes_immobilieres/3132785420',
    verdict: 'none_match',
    candidates: CANDIDATES,
    ...over,
  };
}

describe('submitFeedback', () => {
  it('stores a confirmation with the canonical listing url', async () => {
    const repository = inMemoryRepository();

    const result = await submitFeedback(confirmation(), { repository });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value).toEqual({ searchId: SEARCH_ID, verdict: 'confirmed' });
    expect(repository.calls[0]).toEqual({
      searchId: SEARCH_ID,
      listingUrl: 'https://www.leboncoin.fr/ad/ventes_immobilieres/3132785420',
      verdict: 'confirmed',
      confirmedDpeNumber: '2269E0123456A',
      candidates: CANDIDATES,
    });
  });

  it('stores a none-match without a confirmed dwelling', async () => {
    const repository = inMemoryRepository();

    const result = await submitFeedback(noneMatch(), { repository });

    expect(result.isOk()).toBe(true);
    expect(repository.rows.get(SEARCH_ID)?.confirmedDpeNumber).toBeNull();
  });

  it('accepts a replayed confirmation of the same dwelling', async () => {
    const repository = inMemoryRepository();
    await submitFeedback(confirmation(), { repository });

    const replay = await submitFeedback(confirmation(), { repository });

    expect(replay.isOk()).toBe(true);
    expect(repository.rows.size).toBe(1);
  });

  it('refuses a none-match after a confirmation of the same search', async () => {
    const repository = inMemoryRepository();
    await submitFeedback(confirmation(), { repository });

    const second = await submitFeedback(noneMatch(), { repository });

    expect(second.isErr()).toBe(true);
    if (second.isOk()) return;
    expect(second.error.code).toBe('conflict');
    expect(repository.rows.get(SEARCH_ID)?.verdict).toBe('confirmed');
  });

  it('refuses a confirmation of another dwelling for the same search', async () => {
    const repository = inMemoryRepository();
    await submitFeedback(confirmation(), { repository });

    const second = await submitFeedback(
      confirmation({ confirmedDpeNumber: '2269E0999999B' }),
      { repository },
    );

    expect(second.isErr()).toBe(true);
    if (second.isOk()) return;
    expect(second.error.code).toBe('conflict');
  });

  it('passes a repository failure through', async () => {
    const failure: AppError = { code: 'db_error', message: 'down' };
    const repository: IListingFeedbackRepository = {
      saveVerdict: async () => err(failure),
      saveDetail: async () => err(failure),
    };

    const result = await submitFeedback(noneMatch(), { repository });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) return;
    expect(result.error).toEqual(failure);
  });

  it.each([
    ['a search id that is not a uuid', confirmation({ searchId: 'abc' })],
    [
      'a non-https listing url',
      confirmation({ listingUrl: 'http://www.leboncoin.fr/ad/1' }),
    ],
    [
      'a listing url over 2000 characters',
      confirmation({
        listingUrl: `https://www.leboncoin.fr/${'a'.repeat(2000)}`,
      }),
    ],
    [
      'a confirmation without a dwelling',
      confirmation({ confirmedDpeNumber: undefined }),
    ],
    [
      'a confirmation of a dwelling that was not shown',
      confirmation({ confirmedDpeNumber: '2269E0000000Z' }),
    ],
    [
      'a none-match that names a dwelling',
      noneMatch({ confirmedDpeNumber: '2269E0123456A' }),
    ],
    ['no candidates', noneMatch({ candidates: [] })],
    [
      'more than 10 candidates',
      noneMatch({
        candidates: Array.from({ length: 11 }, (_, i) => ({
          dpeNumber: `2269E00000${String(i).padStart(2, '0')}A`,
          score: 0.5,
        })),
      }),
    ],
    [
      'a score above 1',
      noneMatch({ candidates: [{ dpeNumber: '2269E0123456A', score: 93 }] }),
    ],
    [
      'a dpe number over 64 characters',
      noneMatch({ candidates: [{ dpeNumber: 'x'.repeat(65), score: 0.5 }] }),
    ],
  ])('rejects %s before any write', async (_, input) => {
    const repository = inMemoryRepository();

    const result = await submitFeedback(input, { repository });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) return;
    expect(result.error.code).toBe('validation');
    expect(repository.calls).toHaveLength(0);
  });
});
