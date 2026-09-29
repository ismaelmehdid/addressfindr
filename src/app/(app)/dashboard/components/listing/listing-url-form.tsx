'use client';

import { ArrowRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { candidateOnMap } from '@/core/ademe/candidate-on-map';
import {
  type DetailPreference,
  mapAvailability,
  ResultsWorkspace,
} from './results-workspace';
import {
  FAILURE_KEY,
  type ListingSearchResult,
  MATCH_FAILURE_KEY,
  type MatchState,
  REJECTION_KEY,
  useListingSearch,
} from './use-listing-search';

// why: numbered per search, so the results workspace remounts for each one
// and nothing of the previous listing (selection, verdict, map) carries over.
type ShownResult = ListingSearchResult & { search: number };

type Selection = { dpeNumber: string | null; request: number };

const INITIAL_SELECTION: Selection = { dpeNumber: null, request: 0 };

const COLUMN_LAYOUT_CLASS =
  'flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-4 py-8';
const WORKSPACE_LAYOUT_CLASS = 'relative flex min-h-0 flex-1 flex-col';

export function ListingUrlForm({
  mapboxAccessToken,
  streetViewEnabled,
  streetViewEmbedKey,
}: {
  mapboxAccessToken: string;
  streetViewEnabled: boolean;
  streetViewEmbedKey: string;
}) {
  const t = useTranslations('Listing');
  const [found, setFound] = useState<ShownResult | null>(null);
  const [selection, setSelection] = useState<Selection>(INITIAL_SELECTION);
  const [detailPreference, setDetailPreference] =
    useState<DetailPreference>('default');
  const [mapFailed, setMapFailed] = useState(false);

  function showResult(result: ListingSearchResult): void {
    setFound((current) => ({ ...result, search: (current?.search ?? 0) + 1 }));
    setSelection(INITIAL_SELECTION);
    setDetailPreference('default');
    setMapFailed(false);
  }

  const { url, rejection, status, changeUrl, submit } = useListingSearch({
    onFound: showResult,
  });

  const isError = rejection !== null || status.kind === 'failed';
  const message =
    rejection !== null
      ? t(REJECTION_KEY[rejection])
      : status.kind === 'failed'
        ? t(FAILURE_KEY[status.failure])
        : status.kind === 'pending'
          ? t('analyzing')
          : null;

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
          key={found.search}
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
          streetViewEmbedKey={streetViewEmbedKey}
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
          onNewSearch={showResult}
        />
      ) : (
        <div className="w-full max-w-xl">
          <h1 className="text-center text-[22px] font-semibold leading-[1.3] tracking-[-0.18px] text-ink">
            {t('heading')}
          </h1>
          <div className="mt-6">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
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
                    changeUrl(event.target.value);
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
