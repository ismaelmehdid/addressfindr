'use client';

import { useRef, useState } from 'react';
import * as v from 'valibot';
import { AddressMatchSchema } from '@/application/ademe/dto';
import { ExtractedListingSchema } from '@/application/listing/dto';
import type { AddressMatch } from '@/core/ademe/types';
import type { ExtractedListing } from '@/core/listing/types';
import {
  type ListingUrlRejection,
  validateListingUrl,
} from '@/core/listing/validate-listing-url';

export const REJECTION_KEY = {
  empty: 'errorEmpty',
  malformed: 'errorMalformed',
  'unsupported-portal': 'errorUnsupportedPortal',
} as const satisfies Record<ListingUrlRejection, string>;

type ExtractionFailure = 'not-extractable' | 'rate-limited' | 'unknown';

export const FAILURE_KEY = {
  'not-extractable': 'errorNotExtractable',
  'rate-limited': 'errorRateLimited',
  unknown: 'errorUnknown',
} as const satisfies Record<ExtractionFailure, string>;

type MatchFailure =
  | 'not-enough-signal'
  | 'rate-limited'
  | 'unavailable'
  | 'unknown';

export const MATCH_FAILURE_KEY = {
  'not-enough-signal': 'errorMatchNotEnoughSignal',
  'rate-limited': 'errorMatchRateLimited',
  unavailable: 'errorMatchUnavailable',
  unknown: 'errorMatchUnknown',
} as const satisfies Record<MatchFailure, string>;

export type MatchState =
  | { kind: 'pending' }
  | { kind: 'found'; match: AddressMatch }
  | { kind: 'failed'; failure: MatchFailure };

export type ListingSearchStatus =
  | { kind: 'idle' }
  | { kind: 'pending' }
  | { kind: 'failed'; failure: ExtractionFailure }
  | { kind: 'extracted'; listing: ExtractedListing; match: MatchState };

export type ListingSearchResult = {
  listing: ExtractedListing;
  match: AddressMatch;
};

type ExtractionOutcome =
  | { ok: true; listing: ExtractedListing }
  | { ok: false; failure: ExtractionFailure };

type MatchOutcome =
  | { ok: true; match: AddressMatch }
  | { ok: false; failure: MatchFailure };

function errorCode(body: unknown): unknown {
  return typeof body === 'object' && body !== null && 'error' in body
    ? (body as { error: unknown }).error
    : null;
}

function toFailure(body: unknown): ExtractionFailure {
  const code = errorCode(body);
  if (code === 'validation') return 'not-extractable';
  if (code === 'rate_limited') return 'rate-limited';
  return 'unknown';
}

function toMatchFailure(body: unknown): MatchFailure {
  const code = errorCode(body);
  if (code === 'validation') return 'not-enough-signal';
  if (code === 'rate_limited') return 'rate-limited';
  if (code === 'external_api') return 'unavailable';
  return 'unknown';
}

async function postJson(
  path: string,
  payload: unknown,
): Promise<{ ok: boolean; body: unknown } | null> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    return null;
  }

  try {
    return { ok: response.ok, body: await response.json() };
  } catch {
    return null;
  }
}

async function requestExtraction(url: string): Promise<ExtractionOutcome> {
  const response = await postJson('/api/listings/extract', { url });
  if (response === null) return { ok: false, failure: 'unknown' };
  if (!response.ok) {
    return { ok: false, failure: toFailure(response.body) };
  }

  const parsed = v.safeParse(ExtractedListingSchema, response.body);
  if (!parsed.success) return { ok: false, failure: 'unknown' };
  return { ok: true, listing: parsed.output };
}

async function requestMatch(listing: ExtractedListing): Promise<MatchOutcome> {
  const response = await postJson('/api/listings/match', { listing });
  if (response === null) return { ok: false, failure: 'unknown' };
  if (!response.ok) {
    return { ok: false, failure: toMatchFailure(response.body) };
  }

  const parsed = v.safeParse(AddressMatchSchema, response.body);
  if (!parsed.success) return { ok: false, failure: 'unknown' };
  return { ok: true, match: parsed.output };
}

function hasAddresses(match: AddressMatch): boolean {
  return match.refusedFor === null && match.candidates.length > 0;
}

export function isSearching(status: ListingSearchStatus): boolean {
  return (
    status.kind === 'pending' ||
    (status.kind === 'extracted' && status.match.kind === 'pending')
  );
}

type SearchMessageKey =
  | (typeof REJECTION_KEY)[ListingUrlRejection]
  | (typeof FAILURE_KEY)[ExtractionFailure]
  | (typeof MATCH_FAILURE_KEY)[MatchFailure]
  | 'analyzing'
  | 'addressSearching'
  | 'addressNone'
  | 'addressInsufficientEvidence';

export type SearchMessage = {
  key: SearchMessageKey;
  tone: 'neutral' | 'error';
};

function matchMessage(state: MatchState): SearchMessage {
  if (state.kind === 'pending') {
    return { key: 'addressSearching', tone: 'neutral' };
  }
  if (state.kind === 'failed') {
    return { key: MATCH_FAILURE_KEY[state.failure], tone: 'error' };
  }
  return {
    key:
      state.match.refusedFor === 'insufficient-evidence'
        ? 'addressInsufficientEvidence'
        : 'addressNone',
    tone: 'neutral',
  };
}

export function searchMessage({
  status,
  rejection,
}: {
  status: ListingSearchStatus;
  rejection: ListingUrlRejection | null;
}): SearchMessage | null {
  if (rejection !== null) {
    return { key: REJECTION_KEY[rejection], tone: 'error' };
  }
  switch (status.kind) {
    case 'idle':
      return null;
    case 'pending':
      return { key: 'analyzing', tone: 'neutral' };
    case 'failed':
      return { key: FAILURE_KEY[status.failure], tone: 'error' };
    case 'extracted':
      return matchMessage(status.match);
  }
}

export type ListingSearch = {
  url: string;
  rejection: ListingUrlRejection | null;
  status: ListingSearchStatus;
  changeUrl: (url: string) => void;
  submit: () => Promise<void>;
  reset: () => void;
};

// why: a search that finds addresses hands them to `onFound` and returns to
// its initial state; the caller owns the result on screen, so this hook never
// holds one.
export function useListingSearch({
  onFound,
}: {
  onFound: (result: ListingSearchResult) => void;
}): ListingSearch {
  const [url, setUrl] = useState('');
  const [rejection, setRejection] = useState<ListingUrlRejection | null>(null);
  const [status, setStatus] = useState<ListingSearchStatus>({ kind: 'idle' });
  const latestSubmission = useRef(0);

  function changeUrl(next: string): void {
    setUrl(next);
    setRejection(null);
    setStatus((current) =>
      current.kind === 'failed' ? { kind: 'idle' } : current,
    );
  }

  function reset(): void {
    latestSubmission.current += 1;
    setUrl('');
    setRejection(null);
    setStatus({ kind: 'idle' });
  }

  async function submit(): Promise<void> {
    if (status.kind === 'pending') return;

    const validated = validateListingUrl(url);
    if (!validated.ok) {
      setRejection(validated.reason);
      return;
    }

    // why: a search still in flight can answer after a newer or cancelled one.
    // Its response must never replace the result of the listing on screen.
    latestSubmission.current += 1;
    const submission = latestSubmission.current;
    setRejection(null);
    setStatus({ kind: 'pending' });

    const outcome = await requestExtraction(validated.canonicalUrl);
    if (submission !== latestSubmission.current) return;
    if (!outcome.ok) {
      setStatus({ kind: 'failed', failure: outcome.failure });
      return;
    }

    setStatus({
      kind: 'extracted',
      listing: outcome.listing,
      match: { kind: 'pending' },
    });

    const matched = await requestMatch(outcome.listing);
    if (submission !== latestSubmission.current) return;
    if (matched.ok && hasAddresses(matched.match)) {
      reset();
      onFound({ listing: outcome.listing, match: matched.match });
      return;
    }
    setStatus({
      kind: 'extracted',
      listing: outcome.listing,
      match: matched.ok
        ? { kind: 'found', match: matched.match }
        : { kind: 'failed', failure: matched.failure },
    });
  }

  return { url, rejection, status, changeUrl, submit, reset };
}
