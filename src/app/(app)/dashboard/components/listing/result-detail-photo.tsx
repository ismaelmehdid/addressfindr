'use client';

import { ImageOff, Rotate3d } from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import type { DpeRecord } from '@/core/ademe/types';
import { streetViewPanoramaUrl } from '@/core/street-view/links';
import { cn } from '@/lib/utils';
import { StreetViewPanoramaDialog } from './street-view-panorama-dialog';
import { useCandidatePhoto } from './use-candidate-photo';

// why: in the 85svh mobile sheet a full 320px photo can leave the body no height.
const PHOTO_AREA_CLASS =
  'relative block h-[min(320px,40svh)] shrink-0 overflow-hidden border-b border-border bg-mist lg:h-[320px]';

// why: a <button> may not hold the photo's block elements, so the dialog
// trigger is an empty button laid over the photo; on top, it shows its own
// inset focus ring, which the panel would clip if it were drawn outside.
const PANORAMA_TRIGGER_CLASS =
  'absolute inset-0 z-10 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-charcoal';

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

  const badges = (
    <>
      <Badge variant="secondary" className="absolute bottom-2.5 left-2.5">
        {t('streetViewBadge')}
      </Badge>
      <Badge variant="secondary" className="absolute right-2.5 bottom-2.5">
        <Rotate3d aria-hidden />
        {t('photoExplorePanorama')}
      </Badge>
    </>
  );

  if (streetViewEmbedKey.length > 0) {
    return (
      <div className={PHOTO_AREA_CLASS}>
        {image}
        {badges}
        <StreetViewPanoramaDialog
          point={photo.point}
          address={record.address}
          apiKey={streetViewEmbedKey}
          triggerClassName={PANORAMA_TRIGGER_CLASS}
        />
      </div>
    );
  }

  // why: without a browser embed key, the interactive panorama opens on
  // Google Maps in a new tab rather than inside the app, on the capture
  // closest to the point: resolving the photo's own panorama would spend a
  // lookup on every photo shown. The panel clips an outer focus ring and the
  // positioned photo covers an inset outline, so the ring is a pseudo-element
  // stacked above the photo.
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
      {badges}
    </a>
  );
}
