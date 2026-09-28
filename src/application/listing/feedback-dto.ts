import * as v from 'valibot';
import {
  FEEDBACK_REASONS,
  FEEDBACK_VERDICTS,
  MAX_FEEDBACK_CANDIDATES,
  MAX_FEEDBACK_COMMENT_LENGTH,
  MAX_FEEDBACK_DPE_NUMBER_LENGTH,
  MAX_FEEDBACK_LISTING_URL_LENGTH,
} from '@/core/listing/feedback';

const SearchIdSchema = v.pipe(v.string(), v.uuid());

const DpeNumberSchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.maxLength(MAX_FEEDBACK_DPE_NUMBER_LENGTH),
);

const FeedbackCandidateSchema = v.object({
  dpeNumber: DpeNumberSchema,
  score: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
});

export const SubmitFeedbackInputSchema = v.pipe(
  v.object({
    searchId: SearchIdSchema,
    listingUrl: v.pipe(
      v.string(),
      v.maxLength(MAX_FEEDBACK_LISTING_URL_LENGTH),
      v.url(),
    ),
    verdict: v.picklist(FEEDBACK_VERDICTS),
    confirmedDpeNumber: v.nullish(DpeNumberSchema, null),
    candidates: v.pipe(
      v.array(FeedbackCandidateSchema),
      v.minLength(1),
      v.maxLength(MAX_FEEDBACK_CANDIDATES),
    ),
  }),
  v.forward(
    v.partialCheck(
      [['verdict'], ['confirmedDpeNumber'], ['candidates']],
      (input) =>
        input.verdict === 'confirmed'
          ? input.candidates.some(
              (candidate) => candidate.dpeNumber === input.confirmedDpeNumber,
            )
          : input.confirmedDpeNumber === null,
      'confirmedDpeNumber must name a shown candidate for a confirmation and be absent otherwise',
    ),
    ['confirmedDpeNumber'],
  ),
);

export type SubmitFeedbackInput = v.InferInput<
  typeof SubmitFeedbackInputSchema
>;

export const SubmitFeedbackDetailInputSchema = v.pipe(
  v.object({
    searchId: SearchIdSchema,
    reason: v.nullish(v.picklist(FEEDBACK_REASONS), null),
    comment: v.pipe(
      v.nullish(v.string(), ''),
      v.trim(),
      v.maxLength(MAX_FEEDBACK_COMMENT_LENGTH),
      v.transform((comment) => (comment === '' ? null : comment)),
    ),
  }),
  v.check(
    (input) => input.reason !== null || input.comment !== null,
    'A detail needs a reason or a comment',
  ),
);

export type SubmitFeedbackDetailInput = v.InferInput<
  typeof SubmitFeedbackDetailInputSchema
>;

export const FeedbackReceiptSchema = v.object({
  searchId: v.string(),
  verdict: v.picklist(FEEDBACK_VERDICTS),
});

export type FeedbackReceipt = v.InferOutput<typeof FeedbackReceiptSchema>;

export const FeedbackDetailReceiptSchema = v.object({
  searchId: v.string(),
});

export type FeedbackDetailReceipt = v.InferOutput<
  typeof FeedbackDetailReceiptSchema
>;
