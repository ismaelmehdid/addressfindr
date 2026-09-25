'use client';

import { ArrowRight, MapPin, MapPinOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type FormEvent, useRef, useState } from 'react';
import * as v from 'valibot';
import { AddressMatchSchema } from '@/application/ademe/dto';
import { ExtractedListingSchema } from '@/application/listing/dto';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { candidateOnMap, mapOverview } from '@/core/ademe/candidate-on-map';
import type { AddressCandidate, AddressMatch } from '@/core/ademe/types';
import type { GeoPoint } from '@/core/geo/types';
import {
  EXTRACTED_FIELD_NAMES,
  type ExtractedListing,
} from '@/core/listing/types';
import {
  type ListingUrlRejection,
  validateListingUrl,
} from '@/core/listing/validate-listing-url';
import { AddressCandidateList } from './address-candidate-list';
import {
  AddressResultsMap,
  MAP_LAYOUT_CLASS,
  SEARCH_OVERLAY_CLASS,
} from './address-results-map';

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

type MappedResult = {
  listing: ExtractedListing;
  match: AddressMatch;
  overview: GeoPoint;
};

// why: la carte plein ecran ne s'affiche que si elle peut montrer quelque
// chose de fiable : un jeton Mapbox, une carte que ce navigateur sait
// dessiner, des candidats, et au moins un point geocode parmi eux. Sinon la
// liste reste seule, sans carte.
function mappedResult({
  status,
  mapboxAccessToken,
  mapFailed,
}: {
  status: Status;
  mapboxAccessToken: string;
  mapFailed: boolean;
}): MappedResult | null {
  if (mapboxAccessToken.length === 0 || mapFailed) return null;
  if (status.kind !== 'extracted' || status.match.kind !== 'found') {
    return null;
  }

  const { match } = status.match;
  if (match.refusedFor !== null) return null;
  const overview = mapOverview(match.candidates);
  if (overview === null) return null;
  return { listing: status.listing, match, overview };
}

type Selection = { dpeNumber: string | null; request: number };

const INITIAL_SELECTION: Selection = { dpeNumber: null, request: 0 };

const COLUMN_LAYOUT_CLASS =
  'flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-4 py-8';

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
  const [mapFailed, setMapFailed] = useState(false);
  const latestSubmission = useRef(0);

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

    // why: une recherche encore en cours peut repondre apres une plus recente.
    // Sa reponse ne doit jamais remplacer le resultat de l'annonce affichee.
    latestSubmission.current += 1;
    const submission = latestSubmission.current;
    setRejection(null);
    setSelection(INITIAL_SELECTION);
    setMapFailed(false);
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

  const mapped = mappedResult({ status, mapboxAccessToken, mapFailed });
  const shown =
    mapped === null
      ? null
      : candidateOnMap(mapped.match.candidates, selection.dpeNumber);
  const onMap = mapped !== null && shown !== null;

  // why: le formulaire garde la meme place dans l'arbre React dans les deux
  // mises en page. Le remonter a chaque bascule ferait perdre le focus clavier.
  return (
    <div className={onMap ? MAP_LAYOUT_CLASS : COLUMN_LAYOUT_CLASS}>
      {onMap && (
        <AddressResultsMap
          match={mapped.match}
          overview={mapped.overview}
          shown={shown}
          focusRequest={selection.request}
          onSelect={(dpeNumber) => {
            setSelection((current) => ({
              dpeNumber,
              request: current.request + 1,
            }));
          }}
          onMapFailure={() => {
            setMapFailed(true);
          }}
          accessToken={mapboxAccessToken}
          extraction={formatExtraction(mapped.listing)}
          streetViewEnabled={streetViewEnabled}
        />
      )}
      <div className={onMap ? SEARCH_OVERLAY_CLASS : 'w-full max-w-xl'}>
        {!onMap && (
          <h1 className="text-center text-[22px] font-semibold leading-[1.3] tracking-[-0.18px] text-ink">
            {t('heading')}
          </h1>
        )}
        <Card
          size="sm"
          className={
            onMap
              ? 'gap-0 py-2 shadow-md'
              : 'mt-6 gap-0 overflow-visible rounded-none bg-transparent py-0 ring-0'
          }
        >
          <CardContent className={onMap ? 'px-2' : 'px-0'}>
            <form
              onSubmit={(event) => {
                void handleSubmit(event);
              }}
              className="flex items-start gap-2"
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
                    setRejection(null);
                    // why: taper une nouvelle adresse ne jette pas le resultat
                    // affiche ; seul un nouvel envoi le remplace.
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
            {onMap && (
              <p
                aria-live="polite"
                className="mt-2 flex items-start gap-1.5 px-0.5 text-[12px] leading-[1.4] text-muted-foreground"
              >
                {shown.record.point === null ? (
                  <MapPinOff className="mt-px size-3.5 shrink-0" aria-hidden />
                ) : (
                  <MapPin className="mt-px size-3.5 shrink-0" aria-hidden />
                )}
                {shown.record.point === null
                  ? t('mapNoTrustedPoint', { address: shown.record.address })
                  : t('mapPinned', { address: shown.record.address })}
              </p>
            )}
          </CardContent>
        </Card>
        {!onMap && status.kind === 'extracted' && (
          <>
            <AddressSection
              state={status.match}
              mapboxAccessToken={mapboxAccessToken}
              mapFailed={mapFailed}
              streetViewEnabled={streetViewEnabled}
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
      <p className="sr-only" aria-live="polite">
        {onMap
          ? t('addressFoundAnnouncement', {
              count: mapped.match.candidates.length,
              address: firstAddress(mapped.match.candidates),
            })
          : ''}
      </p>
    </div>
  );
}

function firstAddress(candidates: readonly AddressCandidate[]): string {
  return candidates[0]?.record.address ?? '';
}

function AddressSection({
  state,
  mapboxAccessToken,
  mapFailed,
  streetViewEnabled,
}: {
  state: MatchState;
  mapboxAccessToken: string;
  mapFailed: boolean;
  streetViewEnabled: boolean;
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
        <UnmappedAddressList
          match={state.match}
          mapboxAccessToken={mapboxAccessToken}
          mapFailed={mapFailed}
          streetViewEnabled={streetViewEnabled}
        />
      )}
    </section>
  );
}

function UnmappedAddressList({
  match,
  mapboxAccessToken,
  mapFailed,
  streetViewEnabled,
}: {
  match: AddressMatch;
  mapboxAccessToken: string;
  mapFailed: boolean;
  streetViewEnabled: boolean;
}) {
  const t = useTranslations('Listing');

  if (match.refusedFor === 'insufficient-evidence') {
    return (
      <p className="mt-2 text-[13px] tracking-[-0.08px] text-slate-neutral">
        {t('addressInsufficientEvidence')}
      </p>
    );
  }

  const [first] = match.candidates;
  if (first === undefined) {
    return (
      <p className="mt-2 text-[13px] tracking-[-0.08px] text-slate-neutral">
        {t('addressNone')}
      </p>
    );
  }

  const mapNotice =
    mapboxAccessToken.length === 0
      ? t('mapUnavailable')
      : mapFailed
        ? t('mapFailed')
        : t('mapNoTrustedPoint', { address: first.record.address });

  return (
    <>
      <p className="mt-2 text-[12px] tracking-[-0.08px] text-slate-neutral">
        {mapNotice}
      </p>
      <div className="mt-3">
        <AddressCandidateList
          candidates={match.candidates}
          shownDpeNumber={first.record.dpeNumber}
          streetViewEnabled={streetViewEnabled}
        />
      </div>
      <p className="mt-3 text-[12px] tracking-[-0.08px] text-slate-neutral">
        {match.truncated
          ? t('addressTruncated', { inspected: match.inspected })
          : t('addressInspected', { inspected: match.inspected })}
      </p>
    </>
  );
}
