import 'server-only';

import { and, eq } from 'drizzle-orm';
import { err, ok, type Result } from 'neverthrow';
import * as v from 'valibot';
import { type AppError, unknown } from '@/core/errors';
import {
  FEEDBACK_REASONS,
  FEEDBACK_VERDICTS,
  type StoredFeedback,
} from '@/core/listing/feedback';
import type {
  FeedbackDetail,
  IListingFeedbackRepository,
  NewFeedbackVerdict,
  SavedDetail,
  SavedVerdict,
} from '@/core/listing/ports/listing-feedback-repository.port';
import { db } from '@/infra/database/connection';
import { listingFeedback } from '@/infra/database/schema/listing-feedback-schema';
import { log } from '@/shared/logger';

type ListingFeedbackRow = typeof listingFeedback.$inferSelect;

const VerdictSchema = v.picklist(FEEDBACK_VERDICTS);
const ReasonSchema = v.nullable(v.picklist(FEEDBACK_REASONS));
const CandidatesSchema = v.array(
  v.object({ dpeNumber: v.string(), score: v.number() }),
);

const QueryFailureSchema = v.object({
  cause: v.object({
    code: v.optional(v.string()),
    name: v.optional(v.string()),
  }),
});

function dbError(message: string): AppError {
  return { code: 'db_error', message };
}

// why: a DrizzleQueryError message carries the query params, the free-text
// comment included, so only the Postgres error code and name are logged.
function queryFailure(e: unknown): { code?: string; name?: string } {
  const parsed = v.safeParse(QueryFailureSchema, e);
  return parsed.success ? parsed.output.cause : {};
}

function rowToFeedback(
  row: ListingFeedbackRow,
): Result<StoredFeedback, AppError> {
  const verdict = v.safeParse(VerdictSchema, row.verdict);
  const reason = v.safeParse(ReasonSchema, row.reason);
  const candidates = v.safeParse(CandidatesSchema, row.candidates);
  if (!verdict.success || !reason.success || !candidates.success) {
    return err(unknown(`Invalid listing_feedback row ${row.id}`));
  }
  return ok({
    id: row.id,
    searchId: row.searchId,
    listingUrl: row.listingUrl,
    verdict: verdict.output,
    confirmedDpeNumber: row.confirmedDpeNumber,
    reason: reason.output,
    comment: row.comment,
    candidates: candidates.output,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

async function findBySearchId(
  searchId: string,
): Promise<ListingFeedbackRow | undefined> {
  const [row] = await db
    .select()
    .from(listingFeedback)
    .where(eq(listingFeedback.searchId, searchId))
    .limit(1);
  return row;
}

async function saveVerdict(
  input: NewFeedbackVerdict,
): Promise<Result<SavedVerdict, AppError>> {
  try {
    const inserted = await db
      .insert(listingFeedback)
      .values({
        searchId: input.searchId,
        listingUrl: input.listingUrl,
        verdict: input.verdict,
        confirmedDpeNumber: input.confirmedDpeNumber,
        candidates: [...input.candidates],
      })
      .onConflictDoNothing({ target: listingFeedback.searchId })
      .returning();
    const row = inserted[0] ?? (await findBySearchId(input.searchId));
    if (!row) {
      return err(dbError('listing_feedback row missing after insert'));
    }
    const feedback = rowToFeedback(row);
    if (feedback.isErr()) return err(feedback.error);
    return ok({ feedback: feedback.value, inserted: inserted.length > 0 });
  } catch (e) {
    log.error('listing.feedback.repository.save_verdict_crashed', undefined, {
      searchId: input.searchId,
      ...queryFailure(e),
    });
    return err(dbError('Failed to save the listing feedback verdict'));
  }
}

async function saveDetail(
  input: FeedbackDetail,
): Promise<Result<SavedDetail, AppError>> {
  try {
    const [updated] = await db
      .update(listingFeedback)
      .set({ reason: input.reason, comment: input.comment })
      .where(
        and(
          eq(listingFeedback.searchId, input.searchId),
          eq(listingFeedback.verdict, 'none_match'),
        ),
      )
      .returning();
    if (updated) {
      const feedback = rowToFeedback(updated);
      if (feedback.isErr()) return err(feedback.error);
      return ok({ kind: 'saved', feedback: feedback.value });
    }
    const existing = await findBySearchId(input.searchId);
    if (!existing) return ok({ kind: 'no_verdict' });
    return ok({ kind: 'other_verdict', verdict: existing.verdict });
  } catch (e) {
    log.error('listing.feedback.repository.save_detail_crashed', undefined, {
      searchId: input.searchId,
      ...queryFailure(e),
    });
    return err(dbError('Failed to save the listing feedback detail'));
  }
}

export const listingFeedbackRepository: IListingFeedbackRepository = {
  saveVerdict,
  saveDetail,
};
