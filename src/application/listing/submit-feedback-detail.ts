import 'server-only';

import { err, ok, type Result } from 'neverthrow';
import { type AppError, conflict, notFound, parseInput } from '@/core/errors';
import type { IListingFeedbackRepository } from '@/core/listing/ports/listing-feedback-repository.port';
import { listingFeedbackRepository } from '@/infra/data-access/listing-feedback/listing-feedback-repository';
import { log } from '@/shared/logger';
import {
  type FeedbackDetailReceipt,
  type SubmitFeedbackDetailInput,
  SubmitFeedbackDetailInputSchema,
} from './feedback-dto';

export async function submitFeedbackDetail(
  input: SubmitFeedbackDetailInput,
  deps: { repository?: IListingFeedbackRepository } = {},
): Promise<Result<FeedbackDetailReceipt, AppError>> {
  const parsed = parseInput(
    SubmitFeedbackDetailInputSchema,
    input,
    'Invalid listing feedback detail',
  );
  if (parsed.isErr()) return err(parsed.error);

  const { searchId, reason, comment } = parsed.value;
  log.info('listing.feedback.detail.start', {
    searchId,
    reason,
    hasComment: comment !== null,
  });

  const repository = deps.repository ?? listingFeedbackRepository;
  const saved = await repository.saveDetail({ searchId, reason, comment });
  if (saved.isErr()) {
    log.warn('listing.feedback.detail.failed', {
      searchId,
      code: saved.error.code,
    });
    return err(saved.error);
  }

  if (saved.value.kind === 'no_verdict') {
    log.warn('listing.feedback.detail.failed', {
      searchId,
      reason: 'no_verdict',
    });
    return err(
      notFound('No verdict was recorded for this search', 'listing_feedback'),
    );
  }

  if (saved.value.kind === 'other_verdict') {
    log.warn('listing.feedback.detail.failed', {
      searchId,
      reason: 'not_none_match',
      stored: saved.value.verdict,
    });
    return err(
      conflict('A detail only completes a none_match verdict for this search'),
    );
  }

  log.info('listing.feedback.detail.success', { searchId });
  return ok({ searchId });
}
