import 'server-only';

import { err, ok, type Result } from 'neverthrow';
import { type AppError, conflict, parseInput, validation } from '@/core/errors';
import { canonicalizeListingUrl } from '@/core/listing/canonical-url';
import { type FeedbackAnswer, isSameAnswer } from '@/core/listing/feedback';
import type { IListingFeedbackRepository } from '@/core/listing/ports/listing-feedback-repository.port';
import { listingFeedbackRepository } from '@/infra/data-access/listing-feedback/listing-feedback-repository';
import { log } from '@/shared/logger';
import {
  type FeedbackReceipt,
  type SubmitFeedbackInput,
  SubmitFeedbackInputSchema,
} from './feedback-dto';

export async function submitFeedback(
  input: SubmitFeedbackInput,
  deps: { repository?: IListingFeedbackRepository } = {},
): Promise<Result<FeedbackReceipt, AppError>> {
  const parsed = parseInput(
    SubmitFeedbackInputSchema,
    input,
    'Invalid listing feedback',
  );
  if (parsed.isErr()) return err(parsed.error);

  const listingUrl = canonicalizeListingUrl(parsed.value.listingUrl);
  if (!listingUrl) {
    return err(
      validation('Listing url must be a valid https url', 'listingUrl'),
    );
  }

  const { searchId, verdict, candidates } = parsed.value;
  const answer: FeedbackAnswer = {
    verdict,
    confirmedDpeNumber: parsed.value.confirmedDpeNumber,
  };
  log.info('listing.feedback.submit.start', { searchId, verdict });

  const repository = deps.repository ?? listingFeedbackRepository;
  const saved = await repository.saveVerdict({
    searchId,
    listingUrl,
    ...answer,
    candidates,
  });
  if (saved.isErr()) {
    log.warn('listing.feedback.submit.failed', {
      searchId,
      code: saved.error.code,
    });
    return err(saved.error);
  }

  if (!isSameAnswer(saved.value.feedback, answer)) {
    log.warn('listing.feedback.submit.failed', {
      searchId,
      reason: 'conflicting_verdict',
      stored: saved.value.feedback.verdict,
      requested: verdict,
    });
    return err(conflict('This search already has a different verdict'));
  }

  log.info('listing.feedback.submit.success', {
    searchId,
    verdict,
    replayed: !saved.value.inserted,
  });
  return ok({ searchId, verdict });
}
