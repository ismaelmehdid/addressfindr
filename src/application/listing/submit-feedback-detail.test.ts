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
  FeedbackDetail,
  IListingFeedbackRepository,
  SavedDetail,
} from '@/core/listing/ports/listing-feedback-repository.port';
import { submitFeedbackDetail } from './submit-feedback-detail';

const SEARCH_ID = '6f1c2a4e-8d3b-4c5a-9e7f-0a1b2c3d4e5f';

const NONE_MATCH_ROW: StoredFeedback = {
  id: 'feedback-1',
  searchId: SEARCH_ID,
  listingUrl: 'https://www.leboncoin.fr/ad/ventes_immobilieres/3132785420',
  verdict: 'none_match',
  confirmedDpeNumber: null,
  reason: 'wrong_commune',
  comment: null,
  candidates: [{ dpeNumber: '2269E0123456A', score: 0.93 }],
  createdAt: new Date('2026-09-26T10:00:00Z'),
  updatedAt: new Date('2026-09-26T10:01:00Z'),
};

function repositoryAnswering(
  outcome: SavedDetail,
): IListingFeedbackRepository & {
  calls: FeedbackDetail[];
} {
  const calls: FeedbackDetail[] = [];
  return {
    calls,
    saveVerdict: async () => err({ code: 'unknown', message: 'not used' }),
    async saveDetail(input) {
      calls.push(input);
      return ok(outcome);
    },
  };
}

describe('submitFeedbackDetail', () => {
  it('completes a none-match verdict', async () => {
    const repository = repositoryAnswering({
      kind: 'saved',
      feedback: NONE_MATCH_ROW,
    });

    const result = await submitFeedbackDetail(
      {
        searchId: SEARCH_ID,
        reason: 'wrong_commune',
        comment: '  La maison est à Melesse.  ',
      },
      { repository },
    );

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value).toEqual({ searchId: SEARCH_ID });
    expect(repository.calls).toEqual([
      {
        searchId: SEARCH_ID,
        reason: 'wrong_commune',
        comment: 'La maison est à Melesse.',
      },
    ]);
  });

  it('sends a blank comment as no comment', async () => {
    const repository = repositoryAnswering({
      kind: 'saved',
      feedback: NONE_MATCH_ROW,
    });

    await submitFeedbackDetail(
      { searchId: SEARCH_ID, reason: 'unsure', comment: '   ' },
      { repository },
    );

    expect(repository.calls[0]).toEqual({
      searchId: SEARCH_ID,
      reason: 'unsure',
      comment: null,
    });
  });

  it('accepts a comment without a reason', async () => {
    const repository = repositoryAnswering({
      kind: 'saved',
      feedback: NONE_MATCH_ROW,
    });

    const result = await submitFeedbackDetail(
      { searchId: SEARCH_ID, comment: 'Le bien est en viager.' },
      { repository },
    );

    expect(result.isOk()).toBe(true);
    expect(repository.calls[0]?.reason).toBeNull();
  });

  it('refuses a detail for a confirmed search', async () => {
    const repository = repositoryAnswering({
      kind: 'other_verdict',
      verdict: 'confirmed',
    });

    const result = await submitFeedbackDetail(
      { searchId: SEARCH_ID, reason: 'unsure' },
      { repository },
    );

    expect(result.isErr()).toBe(true);
    if (result.isOk()) return;
    expect(result.error.code).toBe('conflict');
  });

  it('refuses a detail for a search without a verdict', async () => {
    const repository = repositoryAnswering({ kind: 'no_verdict' });

    const result = await submitFeedbackDetail(
      { searchId: SEARCH_ID, reason: 'unsure' },
      { repository },
    );

    expect(result.isErr()).toBe(true);
    if (result.isOk()) return;
    expect(result.error.code).toBe('not_found');
  });

  it('passes a repository failure through', async () => {
    const failure: AppError = { code: 'db_error', message: 'down' };
    const repository: IListingFeedbackRepository = {
      saveVerdict: async () => err(failure),
      saveDetail: async () => err(failure),
    };

    const result = await submitFeedbackDetail(
      { searchId: SEARCH_ID, reason: 'unsure' },
      { repository },
    );

    expect(result.isErr()).toBe(true);
    if (result.isOk()) return;
    expect(result.error).toEqual(failure);
  });

  it.each([
    ['a search id that is not a uuid', { searchId: 'abc', reason: 'unsure' }],
    ['an unknown reason', { searchId: SEARCH_ID, reason: 'too_expensive' }],
    ['neither a reason nor a comment', { searchId: SEARCH_ID, comment: ' ' }],
    [
      'a comment over 1000 characters',
      { searchId: SEARCH_ID, comment: 'a'.repeat(1001) },
    ],
  ])('rejects %s before any write', async (_, input) => {
    const repository = repositoryAnswering({
      kind: 'saved',
      feedback: NONE_MATCH_ROW,
    });

    const result = await submitFeedbackDetail(
      input as Parameters<typeof submitFeedbackDetail>[0],
      { repository },
    );

    expect(result.isErr()).toBe(true);
    if (result.isOk()) return;
    expect(result.error.code).toBe('validation');
    expect(repository.calls).toHaveLength(0);
  });
});
