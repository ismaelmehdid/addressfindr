'use client';

import { ArrowUpRight, ImageOff, Rotate3d } from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { type KeyboardEvent, type ReactNode, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import type { DpeRecord } from '@/core/ademe/types';
import type { GeoPoint } from '@/core/geo/types';
import {
  streetViewEmbedUrl,
  streetViewPanoramaUrl,
} from '@/core/street-view/links';
import { cn } from '@/lib/utils';
import { useCandidatePhoto } from './use-candidate-photo';
import { useFocusWhenShown } from './use-focus-when-shown';
import { useStreetViewPanorama } from './use-street-view-panorama';

// why: in the 85svh mobile sheet a full 320px photo can leave the body no height.
const PHOTO_AREA_CLASS =
  'relative block h-[min(320px,40svh)] shrink-0 overflow-hidden border-b border-border bg-mist lg:h-[320px]';

// why: a <button> may not hold the photo's block elements, so the panorama
// trigger is an empty button laid over the photo; on top, it shows its own
// inset focus ring, which the panel would clip if it were drawn outside.
const PANORAMA_TRIGGER_CLASS =
  'absolute inset-0 z-10 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-charcoal';

const BADGE_BOTTOM_RIGHT_CLASS = 'absolute right-2.5 bottom-2.5';

const PAGING_KEYS: ReadonlySet<string> = new Set(['ArrowLeft', 'ArrowRight']);

export function ResultDetailPhoto({
  record,
  streetViewEnabled,
  streetViewEmbedKey,
}: {
  record: Pick<DpeRecord, 'address' | 'point'>;
  streetViewEnabled: boolean;
  streetViewEmbedKey: string;
}) {
  const t = useTranslations('Listing');
  const { photo, onPhotoError } = useCandidatePhoto({
    point: record.point,
    streetViewEnabled,
  });

  if (photo.kind === 'none') {
    return (
      <div
        className={cn(
          PHOTO_AREA_CLASS,
          'flex flex-col items-center justify-center gap-2',
        )}
      >
        <ImageOff
          aria-hidden
          className="size-8 text-pebble"
          strokeWidth={1.25}
        />
        <p className="text-[13px] text-muted-foreground">
          {t('photoUnavailable')}
        </p>
      </div>
    );
  }

  const image = (
    <>
      <Skeleton className="absolute inset-0 rounded-none" />
      <Image
        key={photo.src}
        unoptimized
        fill
        sizes="420px"
        src={photo.src}
        alt={
          photo.kind === 'street-view'
            ? t('streetViewAlt', { address: record.address })
            : t('aerialAlt', { address: record.address })
        }
        onError={onPhotoError}
        className="object-cover"
      />
    </>
  );

  if (photo.kind === 'aerial') {
    return (
      <div className={PHOTO_AREA_CLASS}>
        {image}
        <Badge variant="secondary" className="absolute bottom-2.5 left-2.5">
          {t('photoSatellite')}
        </Badge>
      </div>
    );
  }

  const streetViewBadge = (
    <Badge variant="secondary" className="absolute bottom-2.5 left-2.5">
      {t('streetViewBadge')}
    </Badge>
  );

  if (streetViewEmbedKey.length > 0) {
    return (
      <ExplorableStreetView
        point={photo.point}
        address={record.address}
        apiKey={streetViewEmbedKey}
      >
        {image}
        {streetViewBadge}
        <Badge variant="secondary" className={BADGE_BOTTOM_RIGHT_CLASS}>
          <Rotate3d aria-hidden />
          {t('photoExplorePanorama')}
        </Badge>
      </ExplorableStreetView>
    );
  }

  // why: without a browser embed key, the interactive panorama opens on
  // Google Maps in a new tab rather than inside the app, and the badge says
  // so instead of promising a panorama explored in place. It opens on the
  // capture closest to the point: resolving the photo's own panorama would
  // spend a lookup on every photo shown. The panel clips an outer focus ring
  // and the positioned photo covers an inset outline, so the ring is a
  // pseudo-element stacked above the photo.
  return (
    <a
      href={streetViewPanoramaUrl({ point: photo.point, panorama: null })}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t('detailStreetViewOpen')}
      className={cn(
        PHOTO_AREA_CLASS,
        'after:pointer-events-none after:absolute after:inset-0 after:z-10 focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-charcoal',
      )}
    >
      {image}
      {streetViewBadge}
      <Badge variant="secondary" className={BADGE_BOTTOM_RIGHT_CLASS}>
        {t('photoOpenInMaps')}
        <ArrowUpRight aria-hidden />
      </Badge>
    </a>
  );
}

// why: the panorama replaces the photo in place and fills the photo area
// alone, so exploring the street never leaves the detail and nothing of ours
// covers the embed's own controls. It points at the photo's own trusted
// point, and focus follows the swap both ways (onto the panorama, then back
// onto the photo) so a keyboard user is never dropped on <body>.
function ExplorableStreetView({
  point,
  address,
  apiKey,
  children,
}: {
  point: GeoPoint;
  address: string;
  apiKey: string;
  children: ReactNode;
}) {
  const t = useTranslations('Listing');
  const [exploring, setExploring] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panoramaRef = useRef<HTMLDivElement | null>(null);
  const focusPanoramaWhenShown = useFocusWhenShown(panoramaRef, exploring);
  const focusTriggerWhenShown = useFocusWhenShown(triggerRef, !exploring);
  const lookup = useStreetViewPanorama({ point, enabled: exploring });

  function startExploring(): void {
    focusPanoramaWhenShown();
    setExploring(true);
  }

  function stopExploring(): void {
    focusTriggerWhenShown();
    setExploring(false);
  }

  // why: Escape leaves the panorama, not the detail, and the arrow keys stay
  // here instead of paging to another result: that remounts this photo,
  // discarding the panorama and dropping focus to <body>. Marking a key
  // handled keeps it from the detail shortcuts, and Escape from the mobile
  // sheet, which skip a key whose default is already prevented. A modified
  // arrow is no shortcut (Alt+Left is the browser's Back), so it goes through.
  function claimKeys(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      stopExploring();
      return;
    }
    const modified =
      event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;
    if (!modified && PAGING_KEYS.has(event.key)) event.preventDefault();
  }

  if (!exploring) {
    return (
      <div className={PHOTO_AREA_CLASS}>
        {children}
        <button
          ref={triggerRef}
          type="button"
          aria-label={t('detailStreetViewExplore')}
          className={PANORAMA_TRIGGER_CLASS}
          onClick={startExploring}
        />
      </div>
    );
  }

  return (
    <div
      ref={panoramaRef}
      role="group"
      tabIndex={-1}
      aria-label={t('streetViewPanoramaLabel', { address })}
      className={cn(PHOTO_AREA_CLASS, 'outline-none')}
      onKeyDown={claimKeys}
    >
      {lookup.kind === 'locating' ? (
        <Skeleton className="absolute inset-0 rounded-none" />
      ) : (
        // why: the key is restricted by referrer, so Google must receive this origin.
        <iframe
          title={t('streetViewPanoramaFrame')}
          src={streetViewEmbedUrl({
            point,
            apiKey,
            panorama: lookup.panorama,
          })}
          allowFullScreen
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          className="absolute inset-0 size-full border-0"
        />
      )}
    </div>
  );
}
