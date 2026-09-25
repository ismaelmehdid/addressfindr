'use client';

import { ArrowRight } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import * as v from 'valibot';
import { AddressMatchSchema } from '@/application/ademe/dto';
import { ExtractedListingSchema } from '@/application/listing/dto';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { candidateOnMap } from '@/core/ademe/candidate-on-map';
import type {
  AddressCandidate,
  AddressMatch,
  MatchSignal,
} from '@/core/ademe/types';
import {
  EXTRACTED_FIELD_NAMES,
  type ExtractedListing,
} from '@/core/listing/types';
import {
  type ListingUrlRejection,
  validateListingUrl,
} from '@/core/listing/validate-listing-url';

// why: mapbox-gl pese environ 500 Ko compresses. Il n'est telecharge qu'au
// premier affichage d'une carte, pas a chaque visite du tableau de bord.
const AddressMap = dynamic(
  () => import('./address-map').then((module) => module.AddressMap),
  {
    ssr: false,
    loading: () => (
      <div className="mt-2 h-[320px] w-full rounded-lg border border-border bg-card" />
    ),
  },
);

const REJECTION_KEY = {
  empty: 'errorEmpty',
  malformed: 'errorMalformed',
  'unsupported-portal': 'errorUnsupportedPortal',
} as const satisfies Record<ListingUrlRejection, string>;

type ExtractionFailure =
  | 'not-extractable'
  | 'rate-limited'
  | 'signed-out'
  | 'unknown';

const FAILURE_KEY = {
  'not-extractable': 'errorNotExtractable',
  'rate-limited': 'errorRateLimited',
  'signed-out': 'errorSignedOut',
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

const SIGNAL_KEY = {
  surfaceM2: 'signalSurface',
  dpeClass: 'signalDpeClass',
  gesClass: 'signalGesClass',
  dpeKwhM2Year: 'signalDpeValue',
  gesKgCo2M2Year: 'signalGesValue',
  heatingEnergy: 'signalHeating',
  yearBuilt: 'signalYearBuilt',
  buildingFloors: 'signalBuildingFloors',
  landSurfaceM2: 'signalLandSurface',
  floor: 'signalFloor',
  annualEnergyCost: 'signalEnergyCost',
  dpeDate: 'signalDpeDate',
  pinDistance: 'signalPin',
} as const satisfies Record<MatchSignal, string>;

type MatchState =
  | { kind: 'pending' }
  | { kind: 'found'; match: AddressMatch }
  | { kind: 'failed'; failure: MatchFailure };

type Status =
  | { kind: 'idle' }
  | { kind: 'rejected'; reason: ListingUrlRejection }
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
  if (code === 'unauthorized' || code === 'forbidden') return 'signed-out';
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

const NAME_WIDTH = 16;
const VALUE_WIDTH = 24;

function formatExtraction(listing: ExtractedListing): string {
  const header = [
    `${'portal'.padEnd(NAME_WIDTH)}${listing.fields.portal}`,
    `${'canonicalUrl'.padEnd(NAME_WIDTH)}${listing.fields.canonicalUrl}`,
  ];
  const rows = EXTRACTED_FIELD_NAMES.map((name) => {
    const value = listing.fields[name];
    const printed = value === null ? 'null' : String(value);
    return `${name.padEnd(NAME_WIDTH)}${printed.padEnd(VALUE_WIDTH)}${listing.sources[name]}`;
  });
  return [...header, '', ...rows].join('\n');
}

export function ListingUrlForm({
  mapboxAccessToken,
}: {
  mapboxAccessToken: string;
}) {
  const t = useTranslations('Listing');
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    if (status.kind === 'pending') return;

    const validated = validateListingUrl(url);
    if (!validated.ok) {
      setStatus({ kind: 'rejected', reason: validated.reason });
      return;
    }

    setStatus({ kind: 'pending' });
    const outcome = await requestExtraction(validated.canonicalUrl);
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
    setStatus({
      kind: 'extracted',
      listing: outcome.listing,
      match: matched.ok
        ? { kind: 'found', match: matched.match }
        : { kind: 'failed', failure: matched.failure },
    });
  }

  const isRejected = status.kind === 'rejected';
  const isFailed = status.kind === 'failed';
  const message = isRejected
    ? t(REJECTION_KEY[status.reason])
    : isFailed
      ? t(FAILURE_KEY[status.failure])
      : status.kind === 'pending'
        ? t('analyzing')
        : null;

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-4 py-8">
      <div className="w-full max-w-xl">
        <h1 className="text-center text-[22px] font-semibold leading-[1.3] tracking-[-0.18px] text-ink">
          {t('heading')}
        </h1>
        <form
          onSubmit={(event) => {
            void handleSubmit(event);
          }}
          className="mt-6 flex items-start gap-2"
        >
          <div className="flex-1">
            <Input
              type="url"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              value={url}
              onChange={(event) => {
                setUrl(event.target.value);
                setStatus({ kind: 'idle' });
              }}
              placeholder={t('placeholder')}
              aria-invalid={isRejected || isFailed}
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
              isRejected || isFailed
                ? 'mt-2 text-[13px] tracking-[-0.08px] text-destructive'
                : 'mt-2 text-[13px] tracking-[-0.08px] text-slate-neutral'
            }
          >
            {message}
          </p>
        )}
        {status.kind === 'extracted' && (
          <>
            <AddressSection
              state={status.match}
              mapboxAccessToken={mapboxAccessToken}
            />
            <section aria-live="polite" className="mt-6">
              <h2 className="text-[13px] font-medium tracking-[-0.08px] text-slate-neutral">
                {t('resultHeading')}
              </h2>
              <pre className="mt-2 overflow-x-auto rounded-lg border border-border bg-card p-3 font-mono text-[12px] leading-[1.6] text-ink">
                {formatExtraction(status.listing)}
              </pre>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function AddressSection({
  state,
  mapboxAccessToken,
}: {
  state: MatchState;
  mapboxAccessToken: string;
}) {
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
        <AddressList
          match={state.match}
          mapboxAccessToken={mapboxAccessToken}
        />
      )}
    </section>
  );
}

function MapPanel({
  candidate,
  mapboxAccessToken,
}: {
  candidate: AddressCandidate;
  mapboxAccessToken: string;
}) {
  const t = useTranslations('Listing');
  const { address, point } = candidate.record;

  if (point === null) {
    return (
      <p className="mt-2 text-[12px] tracking-[-0.08px] text-slate-neutral">
        {t('mapNoTrustedPoint', { address })}
      </p>
    );
  }

  if (mapboxAccessToken.length === 0) {
    return (
      <p className="mt-2 text-[12px] tracking-[-0.08px] text-slate-neutral">
        {t('mapUnavailable')}
      </p>
    );
  }

  return (
    <>
      <p className="mt-2 text-[12px] tracking-[-0.08px] text-slate-neutral">
        {t('mapPinned', { address })}
      </p>
      <AddressMap point={point} accessToken={mapboxAccessToken} />
    </>
  );
}

function AddressList({
  match,
  mapboxAccessToken,
}: {
  match: AddressMatch;
  mapboxAccessToken: string;
}) {
  const t = useTranslations('Listing');
  const [selectedDpeNumber, setSelectedDpeNumber] = useState<string | null>(
    null,
  );

  if (match.refusedFor === 'insufficient-evidence') {
    return (
      <p className="mt-2 text-[13px] tracking-[-0.08px] text-slate-neutral">
        {t('addressInsufficientEvidence')}
      </p>
    );
  }

  if (match.candidates.length === 0) {
    return (
      <p className="mt-2 text-[13px] tracking-[-0.08px] text-slate-neutral">
        {t('addressNone')}
      </p>
    );
  }

  const shown = candidateOnMap(match.candidates, selectedDpeNumber);

  return (
    <>
      {shown !== null && (
        <MapPanel candidate={shown} mapboxAccessToken={mapboxAccessToken} />
      )}
      <ol className="mt-2 flex flex-col gap-2">
        {match.candidates.map((candidate) => (
          <li
            key={candidate.record.dpeNumber}
            aria-current={
              candidate.record.dpeNumber === shown?.record.dpeNumber
                ? 'true'
                : undefined
            }
            className="rounded-lg border border-border bg-card p-3 aria-[current]:border-ink"
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[14px] font-medium tracking-[-0.08px] text-ink">
                {candidate.record.address}
              </span>
              <span className="shrink-0 font-mono text-[12px] text-slate-neutral">
                {t('addressConfidence', {
                  percent: Math.round(candidate.confidence * 100),
                })}
              </span>
            </div>
            <p className="mt-1 text-[12px] leading-[1.6] tracking-[-0.08px] text-slate-neutral">
              {t('addressSupport', {
                count: candidate.supportingRecords,
              })}
              {' · '}
              {t('addressMatchedOn', {
                signals: candidate.matched
                  .map((signal) => t(SIGNAL_KEY[signal]))
                  .join(', '),
              })}
            </p>
            {candidate.diverged.length > 0 && (
              <p className="mt-0.5 text-[12px] leading-[1.6] tracking-[-0.08px] text-destructive">
                {t('addressDivergedOn', {
                  signals: candidate.diverged
                    .map((signal) => t(SIGNAL_KEY[signal]))
                    .join(', '),
                })}
              </p>
            )}
            {candidate.record.point !== null &&
              candidate.record.dpeNumber !== shown?.record.dpeNumber && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDpeNumber(candidate.record.dpeNumber);
                  }}
                  className="mt-1.5 text-[12px] tracking-[-0.08px] text-slate-neutral underline underline-offset-2 hover:text-ink"
                >
                  {t('addressShowOnMap')}
                </button>
              )}
          </li>
        ))}
      </ol>
      <p className="mt-2 text-[12px] tracking-[-0.08px] text-slate-neutral">
        {match.truncated
          ? t('addressTruncated', { inspected: match.inspected })
          : t('addressInspected', { inspected: match.inspected })}
      </p>
    </>
  );
}
