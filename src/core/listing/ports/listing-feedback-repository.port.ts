import type { Result } from 'neverthrow';
import type { AppError } from '@/core/errors';
import type {
  FeedbackCandidate,
  FeedbackReason,
  FeedbackVerdict,
  StoredFeedback,
} from '../feedback';

export type NewFeedbackVerdict = {
  searchId: string;
  listingUrl: string;
  verdict: FeedbackVerdict;
  confirmedDpeNumber: string | null;
  candidates: readonly FeedbackCandidate[];
};

export type FeedbackDetail = {
  searchId: string;
  reason: FeedbackReason | null;
  comment: string | null;
};

export type SavedVerdict = { feedback: StoredFeedback; inserted: boolean };

export type SavedDetail =
  | { kind: 'saved'; feedback: StoredFeedback }
  | { kind: 'no_verdict' }
  | { kind: 'other_verdict'; verdict: FeedbackVerdict };

export interface IListingFeedbackRepository {
  // why: one verdict per search. When the search already has one, that row is
  // returned untouched and the caller decides whether the request replays it.
  saveVerdict(
    input: NewFeedbackVerdict,
  ): Promise<Result<SavedVerdict, AppError>>;

  // why: reason and comment only ever complete a none_match verdict; the
  // outcome says why nothing was written otherwise.
  saveDetail(input: FeedbackDetail): Promise<Result<SavedDetail, AppError>>;
}
