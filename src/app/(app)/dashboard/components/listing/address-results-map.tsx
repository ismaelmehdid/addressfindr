'use client';

import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import type { AddressCandidate, AddressMatch } from '@/core/ademe/types';
import type { GeoPoint } from '@/core/geo/types';
import { AddressCandidateList } from './address-candidate-list';
import { MapErrorBoundary } from './map-error-boundary';

// why: mapbox-gl pese environ 500 Ko compresses. Il n'est telecharge qu'au
// premier affichage d'une carte, pas a chaque visite du tableau de bord.
const AddressMap = dynamic(
  () => import('./address-map').then((module) => module.AddressMap),
  {
    ssr: false,
    loading: () => <Skeleton className="h-full w-full rounded-none" />,
  },
);

// why: meme seuil que le `md:` de Tailwind (48rem), qui pose le panneau sur la
// carte. Un seuil en px divergerait des qu'un utilisateur agrandit la police
// par defaut de son navigateur, et l'epingle serait decentree.
const PANEL_OVER_MAP_QUERY = '(min-width: 48rem)';

// why: le panneau (400px + 12px de marge de chaque cote) recouvre la droite de
// la carte ; l'epingle est centree dans ce qui reste visible. Toutes les
// marges sont explicites car Mapbox conserve celles qu'on omet.
const PANEL_CLEARANCE = { top: 0, right: 424, bottom: 0, left: 0 };
const NO_CLEARANCE = { top: 0, right: 0, bottom: 0, left: 0 };

function subscribeToPanelLayout(onChange: () => void): () => void {
  const query = window.matchMedia(PANEL_OVER_MAP_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function panelIsOverMap(): boolean {
  return window.matchMedia(PANEL_OVER_MAP_QUERY).matches;
}

function panelIsOverMapOnServer(): boolean {
  return false;
}

export const MAP_LAYOUT_CLASS =
  'relative flex min-h-0 flex-1 flex-col md:block';
export const SEARCH_OVERLAY_CLASS =
  'absolute inset-x-3 top-3 z-10 md:right-auto md:w-[min(28rem,calc(100%_-_400px_-_3rem))]';

export function AddressResultsMap({
  match,
  overview,
  shown,
  focusRequest,
  onSelect,
  onMapFailure,
  accessToken,
  extraction,
  streetViewEnabled,
}: {
  match: AddressMatch;
  overview: GeoPoint;
  shown: AddressCandidate;
  focusRequest: number;
  onSelect: (dpeNumber: string) => void;
  onMapFailure: () => void;
  accessToken: string;
  extraction: string;
  streetViewEnabled: boolean;
}) {
  const t = useTranslations('Listing');
  const overMap = useSyncExternalStore(
    subscribeToPanelLayout,
    panelIsOverMap,
    panelIsOverMapOnServer,
  );
  const { candidates } = match;
  const index = candidates.findIndex(
    (candidate) => candidate.record.dpeNumber === shown.record.dpeNumber,
  );
  const previous = candidates[index - 1];
  const next = candidates[index + 1];

  return (
    <>
      <div className="relative min-h-0 flex-1 md:absolute md:inset-0">
        <div className="absolute inset-0">
          <MapErrorBoundary fallback={null} onError={onMapFailure}>
            <AddressMap
              point={shown.record.point}
              overview={overview}
              focusRequest={focusRequest}
              padding={overMap ? PANEL_CLEARANCE : NO_CLEARANCE}
              accessToken={accessToken}
            />
          </MapErrorBoundary>
        </div>
      </div>

      <aside
        aria-label={t('addressHeading')}
        className="flex h-[45%] shrink-0 flex-col md:absolute md:inset-y-3 md:right-3 md:z-10 md:h-auto md:w-[400px]"
      >
        <Card className="min-h-0 flex-1 gap-0 rounded-none py-0 md:rounded-xl md:shadow-lg">
          <CardHeader className="border-b py-2.5">
            <CardTitle className="text-[15px] font-semibold">
              {t('addressHeading')}
            </CardTitle>
            <CardAction className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t('addressPrevious')}
                disabled={previous === undefined}
                focusableWhenDisabled
                onClick={() => {
                  if (previous !== undefined) {
                    onSelect(previous.record.dpeNumber);
                  }
                }}
              >
                <ChevronLeft />
              </Button>
              <span className="min-w-10 text-center text-[12px] tabular-nums text-muted-foreground">
                {t('addressPager', {
                  index: index + 1,
                  total: candidates.length,
                })}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t('addressNext')}
                disabled={next === undefined}
                focusableWhenDisabled
                onClick={() => {
                  if (next !== undefined) onSelect(next.record.dpeNumber);
                }}
              >
                <ChevronRight />
              </Button>
            </CardAction>
          </CardHeader>
          <ScrollArea className="min-h-0 flex-1">
            <div className="p-3">
              <AddressCandidateList
                candidates={candidates}
                shownDpeNumber={shown.record.dpeNumber}
                onSelect={onSelect}
                streetViewEnabled={streetViewEnabled}
              />
              <p className="mt-4 px-0.5 text-[12px] text-muted-foreground">
                {match.truncated
                  ? t('addressTruncated', { inspected: match.inspected })
                  : t('addressInspected', { inspected: match.inspected })}
              </p>
              <Collapsible className="mt-2">
                <CollapsibleTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="sm"
                      className="group/extraction -mx-1 text-muted-foreground"
                    />
                  }
                >
                  {t('resultHeading')}
                  <ChevronDown className="transition-transform group-data-[panel-open]/extraction:rotate-180" />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <pre className="mt-2 overflow-x-auto rounded-lg border border-border bg-card p-3 font-mono text-[12px] leading-[1.6] text-ink">
                    {extraction}
                  </pre>
                </CollapsibleContent>
              </Collapsible>
            </div>
          </ScrollArea>
        </Card>
      </aside>
    </>
  );
}
