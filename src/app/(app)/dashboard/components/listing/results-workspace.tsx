'use client';

import { ChevronDown, Info, MapPin, MapPinOff } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { EmptyState } from '@/components/ui/empty-state';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { mapOverview } from '@/core/ademe/candidate-on-map';
import { needsVerification } from '@/core/ademe/needs-verification';
import type { AddressCandidate, AddressMatch } from '@/core/ademe/types';
import type { GeoPoint } from '@/core/geo/types';
import type { ExtractedListing } from '@/core/listing/types';
import { useMediaQuery } from '@/hooks/use-media-query';
import { cn } from '@/lib/utils';
import { AddressCandidateList } from './address-candidate-list';
import { AnalysedListingCard } from './analysed-listing-card';
import { revealInScrollArea } from './center-in-scroll-area';
import { MapErrorBoundary } from './map-error-boundary';
import { DEFAULT_MAP_VIEW, type MapView } from './map-view';
import { MapViewSwitch } from './map-view-switch';
import { MissingListingFeedback } from './missing-listing-feedback';
import { NewSearchDialog } from './new-search-dialog';
import { ResultDetailPanel } from './result-detail-panel';
import { useDetailShortcuts } from './use-detail-shortcuts';
import type { ListingSearchResult } from './use-listing-search';
import { useSearchFeedback } from './use-search-feedback';

// why: mapbox-gl weighs about 500 KB compressed. It is only downloaded the
// first time a map is shown, not on every dashboard visit.
const AddressMap = dynamic(
  () => import('./address-map').then((module) => module.AddressMap),
  {
    ssr: false,
    loading: () => <Skeleton className="h-full w-full rounded-none" />,
  },
);

// why: same thresholds as Tailwind's `lg:` (64rem) and `xl:` (80rem), which
// lay the regions out; a px threshold would diverge when a user enlarges the
// browser's default font size.
const LG_QUERY = '(min-width: 64rem)';
const XL_QUERY = '(min-width: 80rem)';

// why: between lg and xl the detail panel (400px plus a 12px margin on each
// side) floats over the right of the map; the pin is centred in what stays
// visible. Every side is explicit because Mapbox keeps the ones left out.
const PANEL_CLEARANCE = { top: 0, right: 424, bottom: 0, left: 0 };
const NO_CLEARANCE = { top: 0, right: 0, bottom: 0, left: 0 };

export type DetailPreference = 'default' | 'open' | 'closed';

export type MapAvailability =
  | { kind: 'ready'; overview: GeoPoint }
  | { kind: 'unavailable' }
  | { kind: 'no-trusted-point' }
  | { kind: 'failed' };

export function mapAvailability({
  candidates,
  mapboxAccessToken,
  mapFailed,
}: {
  candidates: readonly AddressCandidate[];
  mapboxAccessToken: string;
  mapFailed: boolean;
}): MapAvailability {
  if (mapboxAccessToken.length === 0) return { kind: 'unavailable' };
  if (mapFailed) return { kind: 'failed' };
  const overview = mapOverview(candidates);
  return overview === null
    ? { kind: 'no-trusted-point' }
    : { kind: 'ready', overview };
}

export function ResultsWorkspace({
  listing,
  match,
  shown,
  focusRequest,
  detailPreference,
  map,
  accessToken,
  streetViewEnabled,
  streetViewEmbedKey,
  onSelect,
  onCloseDetail,
  onMapFailure,
  onNewSearch,
}: {
  listing: ExtractedListing;
  match: AddressMatch;
  shown: AddressCandidate;
  focusRequest: number;
  detailPreference: DetailPreference;
  map: MapAvailability;
  accessToken: string;
  streetViewEnabled: boolean;
  streetViewEmbedKey: string;
  onSelect: (dpeNumber: string) => void;
  onCloseDetail: () => void;
  onMapFailure: () => void;
  onNewSearch: (result: ListingSearchResult) => void;
}) {
  const t = useTranslations('Listing');
  const isLg = useMediaQuery(LG_QUERY);
  const isXl = useMediaQuery(XL_QUERY);
  const feedback = useSearchFeedback({
    listingUrl: listing.fields.canonicalUrl,
    candidates: match.candidates,
  });
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const resultsRef = useRef<HTMLElement | null>(null);
  const asideRef = useRef<HTMLElement | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const [mapView, setMapView] = useState<MapView>(DEFAULT_MAP_VIEW);
  const { candidates } = match;
  const total = candidates.length;
  const index = Math.max(
    0,
    candidates.findIndex(
      (candidate) => candidate.record.dpeNumber === shown.record.dpeNumber,
    ),
  );
  // why: the arrow-key shortcuts wrap around, so as soon as there are two
  // results every one of them has a neighbour on both sides.
  const previous =
    total > 1 ? candidates[(index - 1 + total) % total] : undefined;
  const next = total > 1 ? candidates[(index + 1) % total] : undefined;
  const rank = index + 1;
  const detailOpen =
    detailPreference === 'default' ? isXl : detailPreference === 'open';
  const selectPrevious =
    previous === undefined
      ? null
      : (): void => {
          onSelect(previous.record.dpeNumber);
        };
  const selectNext =
    next === undefined
      ? null
      : (): void => {
          onSelect(next.record.dpeNumber);
        };
  const panelFloats = isLg && !isXl && detailOpen;
  const padding = panelFloats ? PANEL_CLEARANCE : NO_CLEARANCE;

  // why: the search form is not part of this view, so keyboard focus would
  // fall to <body> when it appears; it lands on the results heading instead.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  // why: closing the detail (its close button, Escape, or the mobile Sheet's
  // onOpenChange(false)) can unmount the panel that held focus. Focus then
  // returns to the shown result's card, the one marked current while the
  // detail is open. preventScroll keeps the page still; the list moves only
  // to show the card's focus ring, when the browser draws one (a keyboard
  // close, not a pointer one) and the card is out of view, as after tabbing
  // past every later card to reach the detail. Focus outside the detail, such
  // as on a card where Escape was pressed, stays where it is.
  function closeDetail(): void {
    const focused = document.activeElement;
    const focusInDetail =
      focused !== null &&
      [asideRef.current, sheetRef.current].some(
        (panel) => panel?.contains(focused) === true,
      );
    const shownCard =
      resultsRef.current?.querySelector<HTMLElement>(
        'button[aria-current="true"]',
      ) ?? null;
    onCloseDetail();
    requestAnimationFrame(() => {
      const active = document.activeElement;
      const fellToBody = active === null || active === document.body;
      if (!focusInDetail && !fellToBody) return;
      const target =
        shownCard?.isConnected === true ? shownCard : headingRef.current;
      if (target === null) return;
      target.focus({ preventScroll: true });
      if (target.matches(':focus-visible')) revealInScrollArea(target);
    });
  }

  // why: the mobile Sheet already closes itself on Escape; only the lg panel
  // needs the shortcut to close it.
  useDetailShortcuts({
    enabled: detailOpen,
    onClose: isLg ? closeDetail : null,
    onPrevious: selectPrevious,
    onNext: selectNext,
  });

  const detail = (
    <ResultDetailPanel
      candidate={shown}
      rank={rank}
      onClose={closeDetail}
      streetViewEnabled={streetViewEnabled}
      streetViewEmbedKey={streetViewEmbedKey}
      listing={listing.fields}
      feedback={feedback}
    />
  );

  return (
    <div
      className={cn(
        'relative grid min-h-0 flex-1 grid-rows-[45%_minmax(0,1fr)] lg:grid-cols-[360px_minmax(0,1fr)] lg:grid-rows-1',
        detailOpen && 'xl:grid-cols-[360px_minmax(0,1fr)_420px]',
      )}
    >
      <section
        ref={resultsRef}
        aria-labelledby="results-heading"
        className="order-2 flex min-h-0 flex-col border-t border-border bg-linen lg:order-none lg:border-t-0 lg:border-r"
      >
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-4 p-3">
            <NewSearchDialog onFound={onNewSearch} />
            <AnalysedListingCard listing={listing} />
            <h2
              id="results-heading"
              ref={headingRef}
              tabIndex={-1}
              className="text-[15px] font-semibold text-ink outline-none"
            >
              {t('addressHeading')}
            </h2>
            {needsVerification(match) && (
              <Alert role="status">
                <Info />
                <Collapsible className="col-start-2">
                  <CollapsibleTrigger className="group/verify flex w-full cursor-pointer items-center justify-between gap-2 text-left font-medium">
                    {t('verifyNoticeTitle')}
                    <ChevronDown
                      aria-hidden
                      className="size-4 transition-transform group-data-[panel-open]/verify:rotate-180"
                    />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <AlertDescription className="mt-1">
                      {t('verifyNoticeBody')}
                    </AlertDescription>
                  </CollapsibleContent>
                </Collapsible>
              </Alert>
            )}
            <AddressCandidateList
              candidates={candidates}
              selectedDpeNumber={detailOpen ? shown.record.dpeNumber : null}
              onSelect={onSelect}
              streetViewEnabled={streetViewEnabled}
            />
            <MissingListingFeedback feedback={feedback} />
          </div>
        </ScrollArea>
      </section>

      <div
        role="region"
        aria-label={t('mapRegionLabel')}
        className="relative order-1 min-h-0 lg:order-none"
      >
        {map.kind === 'ready' ? (
          <>
            <div
              className={cn(
                'absolute inset-0',
                // why: the floating panel covers the right 424px of the map
                // (PANEL_CLEARANCE), so the bottom-right controls, the
                // attribution among them, move clear of it. mapbox-gl.css is
                // unlayered, so only an !important utility outranks its
                // `right: 0`. The stack also stops at the bottom-left Mapbox
                // logo (its right edge sits near 94px, plus a 10px gap) so
                // the two never overlap.
                panelFloats && '[&_.mapboxgl-ctrl-bottom-right]:right-[424px]!',
                panelFloats && '[&_.mapboxgl-ctrl-bottom-right]:left-[104px]!',
              )}
            >
              <MapErrorBoundary fallback={null} onError={onMapFailure}>
                <AddressMap
                  point={shown.record.point}
                  overview={map.overview}
                  focusRequest={focusRequest}
                  padding={padding}
                  view={mapView}
                  accessToken={accessToken}
                />
              </MapErrorBoundary>
            </div>
            <div
              className={cn(
                'pointer-events-none absolute top-3 left-3 z-10 @container',
                // why: between lg and xl the floating detail panel (z-20)
                // covers the right 424px, so the chip and the switch stay
                // left of it. Side by side, the chip wraps before it reaches
                // the switch; in a strip narrower than 20rem it would shrink
                // to a word per line, so it drops below the switch instead.
                panelFloats ? 'right-[424px]' : 'right-3',
              )}
            >
              <div className="flex flex-col-reverse items-end gap-2 @xs:flex-row @xs:items-start @xs:justify-between">
                <Badge
                  variant="outline"
                  aria-live="polite"
                  className="pointer-events-auto h-auto min-w-0 shrink gap-1.5 self-start bg-paper py-1 whitespace-normal shadow-sm"
                >
                  {shown.record.point === null ? (
                    <MapPinOff aria-hidden />
                  ) : (
                    <MapPin aria-hidden />
                  )}
                  {shown.record.point === null
                    ? t('mapNoTrustedPoint', { address: shown.record.address })
                    : t('mapPinned', { address: shown.record.address })}
                </Badge>
                <MapViewSwitch
                  view={mapView}
                  onViewChange={setMapView}
                  className="pointer-events-auto shrink-0"
                />
              </div>
            </div>
          </>
        ) : (
          <EmptyState
            icon={MapPinOff}
            title={
              map.kind === 'unavailable'
                ? t('mapUnavailable')
                : map.kind === 'failed'
                  ? t('mapFailed')
                  : t('mapNoTrustedPoint', { address: shown.record.address })
            }
            className="h-full bg-mist"
          />
        )}
      </div>

      {isLg && detailOpen && (
        <aside
          ref={asideRef}
          aria-label={t('detailTitle', { rank })}
          className="absolute inset-y-3 right-3 z-20 flex w-[400px] min-h-0 xl:static xl:inset-auto xl:z-auto xl:w-auto"
        >
          <Card className="min-h-0 flex-1 gap-0 py-0 shadow-lg xl:rounded-none xl:border-l xl:shadow-none xl:ring-0">
            {detail}
          </Card>
        </aside>
      )}

      {!isLg && (
        <Sheet
          open={detailOpen}
          onOpenChange={(open, details) => {
            // why: an Escape the detail already handled (leaving the Street
            // View panorama) must not also close the sheet, as on lg.
            if (
              !open &&
              details.reason === 'escape-key' &&
              details.event.defaultPrevented
            ) {
              details.cancel();
              return;
            }
            if (!open) closeDetail();
          }}
        >
          <SheetContent
            ref={sheetRef}
            side="bottom"
            showCloseButton={false}
            // why: replaces the primitive's same-variant h-auto, under which the detail's scroll area never scrolls
            className="flex flex-col gap-0 p-0 data-[side=bottom]:h-[85svh]"
          >
            <SheetTitle className="sr-only">
              {t('detailTitle', { rank })}
            </SheetTitle>
            {detail}
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
