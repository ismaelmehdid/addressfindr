'use client';

import { ArrowRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import * as v from 'valibot';
import { AddressMatchSchema } from '@/application/ademe/dto';
import { ExtractedListingSchema } from '@/application/listing/dto';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { candidateOnMap } from '@/core/ademe/candidate-on-map';
import type { AddressMatch } from '@/core/ademe/types';
import type { ExtractedListing } from '@/core/listing/types';
import {
  type ListingUrlRejection,
  validateListingUrl,
} from '@/core/listing/validate-listing-url';
import {
  type DetailPreference,
  mapAvailability,
  ResultsWorkspace,
} from './results-workspace';

const REJECTION_KEY = {
  empty: 'errorEmpty',
  malformed: 'errorMalformed',
  'unsupported-portal': 'errorUnsupportedPortal',
} as const satisfies Record<ListingUrlRejection, string>;

type ExtractionFailure = 'not-extractable' | 'rate-limited' | 'unknown';

const FAILURE_KEY = {
  'not-extractable': 'errorNotExtractable',
  'rate-limited': 'errorRateLimited',
  unknown: 'errorUnknown',
} as const satisfies Record<ExtractionFailure, string>;

type MatchFailure =
  | 'not-enough-signal'
  | 'rate-limited'
  | 'unavailable'
  | 'unknown';

const MATCH_FAILURE_KEY = {
  'not-enough-signal': 'errorMatchNotEnoughSignal',
  'rate-limited': 'errorMatchRateLimited',
  unavailable: 'errorMatchUnavailable',
  unknown: 'errorMatchUnknown',
} as const satisfies Record<MatchFailure, string>;

type MatchState =
  | { kind: 'pending' }
  | { kind: 'found'; match: AddressMatch }
  | { kind: 'failed'; failure: MatchFailure };

type Status =
  | { kind: 'idle' }
  | { kind: 'pending' }
  | { kind: 'failed'; failure: ExtractionFailure }
  | { kind: 'extracted'; listing: ExtractedListing; match: MatchState };

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

type FoundResult = { listing: ExtractedListing; match: AddressMatch };

function foundResult(status: Status): FoundResult | null {
  if (status.kind !== 'extracted' || status.match.kind !== 'found') {
    return null;
  }
  const { match } = status.match;
  if (match.refusedFor !== null || match.candidates.length === 0) return null;
  return { listing: status.listing, match };
}

type Selection = { dpeNumber: string | null; request: number };

const INITIAL_SELECTION: Selection = { dpeNumber: null, request: 0 };

const COLUMN_LAYOUT_CLASS =
  'flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-4 py-8';
const WORKSPACE_LAYOUT_CLASS = 'relative flex min-h-0 flex-1 flex-col';

export function ListingUrlForm({
  mapboxAccessToken,
  streetViewEnabled,
}: {
  mapboxAccessToken: string;
  streetViewEnabled: boolean;
}) {
  const t = useTranslations('Listing');
  const [url, setUrl] = useState('');
  const [rejection, setRejection] = useState<ListingUrlRejection | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [selection, setSelection] = useState<Selection>(INITIAL_SELECTION);
  const [detailPreference, setDetailPreference] =
    useState<DetailPreference>('default');
  const [mapFailed, setMapFailed] = useState(false);
  const [searchFocusRequest, setSearchFocusRequest] = useState(0);
  const latestSubmission = useRef(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (searchFocusRequest > 0) inputRef.current?.focus();
  }, [searchFocusRequest]);

  function resetResult(): void {
    setSelection(INITIAL_SELECTION);
    setDetailPreference('default');
    setMapFailed(false);
  }

  function startNewSearch(): void {
    latestSubmission.current += 1;
    resetResult();
    setUrl('');
    setRejection(null);
    setStatus({ kind: 'idle' });
    setSearchFocusRequest((current) => current + 1);
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    if (status.kind === 'pending') return;

    const validated = validateListingUrl(url);
    if (!validated.ok) {
      setRejection(validated.reason);
      return;
    }

    // why: a search still in flight can answer after a newer one. Its response
    // must never replace the result of the listing on screen.
    latestSubmission.current += 1;
    const submission = latestSubmission.current;
    setRejection(null);
    resetResult();
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
    setStatus({
      kind: 'extracted',
      listing: outcome.listing,
      match: matched.ok
        ? { kind: 'found', match: matched.match }
        : { kind: 'failed', failure: matched.failure },
    });
  }

  const isError = rejection !== null || status.kind === 'failed';
  const message =
    rejection !== null
      ? t(REJECTION_KEY[rejection])
      : status.kind === 'failed'
        ? t(FAILURE_KEY[status.failure])
        : status.kind === 'pending'
          ? t('analyzing')
          : null;

  const found = foundResult(status);
  const shown =
    found === null
      ? null
      : candidateOnMap(found.match.candidates, selection.dpeNumber);

  // why: the live region is the last child of the same root element in both
  // layouts, so it never unmounts and the result is announced when it lands.
  return (
    <div
      className={
        found !== null && shown !== null
          ? WORKSPACE_LAYOUT_CLASS
          : COLUMN_LAYOUT_CLASS
      }
    >
      {found !== null && shown !== null ? (
        <ResultsWorkspace
          listing={found.listing}
          match={found.match}
          shown={shown}
          focusRequest={selection.request}
          detailPreference={detailPreference}
          map={mapAvailability({
            candidates: found.match.candidates,
            mapboxAccessToken,
            mapFailed,
          })}
          accessToken={mapboxAccessToken}
          streetViewEnabled={streetViewEnabled}
          onSelect={(dpeNumber) => {
            setSelection((current) => ({
              dpeNumber,
              request: current.request + 1,
            }));
            setDetailPreference('open');
          }}
          onCloseDetail={() => {
            setDetailPreference('closed');
          }}
          onMapFailure={() => {
            setMapFailed(true);
          }}
          onNewSearch={startNewSearch}
        />
      ) : (
        <div className="w-full max-w-xl">
          <h1 className="text-center text-[22px] font-semibold leading-[1.3] tracking-[-0.18px] text-ink">
            {t('heading')}
          </h1>
          <div className="mt-6">
            <form
              onSubmit={(event) => {
                void handleSubmit(event);
              }}
              className="flex items-start gap-2"
            >
              <div className="flex-1">
                <Input
                  ref={inputRef}
                  type="url"
                  inputMode="url"
                  autoComplete="off"
                  spellCheck={false}
                  value={url}
                  onChange={(event) => {
                    setUrl(event.target.value);
                    setRejection(null);
                    setStatus((current) =>
                      current.kind === 'failed' ? { kind: 'idle' } : current,
                    );
                  }}
                  placeholder={t('placeholder')}
                  aria-label={t('heading')}
                  aria-invalid={isError}
                  aria-describedby={
                    message === null ? undefined : 'listing-url-status'
                  }
                  className="h-9"
                />
              </div>
              <Button
                type="submit"
                size="sm"
                loading={status.kind === 'pending'}
                className="h-9 shrink-0"
              >
                {t('submit')}
                <ArrowRight className="size-3.5" />
              </Button>
            </form>
            {message !== null && (
              <p
                id="listing-url-status"
                aria-live="polite"
                className={
                  isError
                    ? 'mt-2 text-[13px] tracking-[-0.08px] text-destructive'
                    : 'mt-2 text-[13px] tracking-[-0.08px] text-slate-neutral'
                }
              >
                {message}
              </p>
            )}
          </div>
          {status.kind === 'extracted' && (
            <AddressSection state={status.match} />
          )}
        </div>
      )}
      <p className="sr-only" aria-live="polite">
        {found !== null
          ? t('addressFoundAnnouncement', {
              count: found.match.candidates.length,
              address: found.match.candidates[0]?.record.address ?? '',
            })
          : ''}
      </p>
    </div>
  );
}

function AddressSection({ state }: { state: MatchState }) {
  const t = useTranslations('Listing');

  return (
    <section aria-live="polite" className="mt-6">
      <h2 className="text-[13px] font-medium tracking-[-0.08px] text-slate-neutral">
        {t('addressHeading')}
      </h2>
      {state.kind === 'pending' && (
        <p className="mt-2 text-[13px] tracking-[-0.08px] text-slate-neutral">
          {t('addressSearching')}
        </p>
      )}
      {state.kind === 'failed' && (
        <p className="mt-2 text-[13px] tracking-[-0.08px] text-destructive">
          {t(MATCH_FAILURE_KEY[state.failure])}
        </p>
      )}
      {state.kind === 'found' && (
        <p className="mt-2 text-[13px] tracking-[-0.08px] text-slate-neutral">
          {state.match.refusedFor === 'insufficient-evidence'
            ? t('addressInsufficientEvidence')
            : t('addressNone')}
        </p>
      )}
    </section>
  );
}
