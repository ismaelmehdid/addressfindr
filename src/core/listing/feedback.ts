import { MAX_CANDIDATES_RETURNED } from '@/core/ademe/types';

export const FEEDBACK_VERDICTS = ['confirmed', 'none_match'] as const;
export type FeedbackVerdict = (typeof FEEDBACK_VERDICTS)[number];

export const FEEDBACK_REASONS = [
  'wrong_commune',
  'wrong_dwellings',
  'address_missing',
  'unsure',
] as const;
export type FeedbackReason = (typeof FEEDBACK_REASONS)[number];

export type FeedbackCandidate = { dpeNumber: string; score: number };

// why: a result never shows more candidates than the matcher returns.
export const MAX_FEEDBACK_CANDIDATES = MAX_CANDIDATES_RETURNED;
export const MAX_FEEDBACK_COMMENT_LENGTH = 1000;
export const MAX_FEEDBACK_LISTING_URL_LENGTH = 2000;
export const MAX_FEEDBACK_DPE_NUMBER_LENGTH = 64;

export type FeedbackAnswer = {
  verdict: FeedbackVerdict;
  confirmedDpeNumber: string | null;
};

export type StoredFeedback = FeedbackAnswer & {
  id: string;
  searchId: string;
  listingUrl: string;
  reason: FeedbackReason | null;
  comment: string | null;
  candidates: readonly FeedbackCandidate[];
  createdAt: Date;
  updatedAt: Date;
};

// why: a replay (double click, network retry) repeats the same answer. A
// confirmation of another dwelling is a different answer, not a replay.
export function isSameAnswer(
  stored: FeedbackAnswer,
  requested: FeedbackAnswer,
): boolean {
  return (
    stored.verdict === requested.verdict &&
    stored.confirmedDpeNumber === requested.confirmedDpeNumber
  );
}

export function isFeedbackReason(value: unknown): value is FeedbackReason {
  return FEEDBACK_REASONS.some((reason) => reason === value);
}

export function toFeedbackCandidates(
  shown: readonly { record: { dpeNumber: string }; confidence: number }[],
): FeedbackCandidate[] {
  return shown.slice(0, MAX_FEEDBACK_CANDIDATES).map((candidate) => ({
    dpeNumber: candidate.record.dpeNumber,
    score: candidate.confidence,
  }));
}
