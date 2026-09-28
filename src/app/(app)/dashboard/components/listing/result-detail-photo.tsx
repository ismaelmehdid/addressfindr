'use client';

import { ImageOff, Rotate3d } from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import type { DpeRecord } from '@/core/ademe/types';
import { streetViewPanoramaUrl } from '@/core/street-view/links';
import { cn } from '@/lib/utils';
import { useCandidatePhoto } from './use-candidate-photo';

// why: in the 85svh mobile sheet a full 320px photo can leave the body no height.
const PHOTO_AREA_CLASS =
  'relative block h-[min(320px,40svh)] shrink-0 overflow-hidden border-b border-border bg-mist lg:h-[320px]';

export function ResultDetailPhoto({
  record,
  streetViewEnabled,
}: {
  record: Pick<DpeRecord, 'address' | 'point'>;
  streetViewEnabled: boolean;
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

  // why: the Google key stays on the server, so the interactive panorama
  // opens on Google Maps in a new tab rather than inside the panel. The panel
  // clips an outer focus ring and the positioned photo covers an inset
  // outline, so the ring is a pseudo-element stacked above the photo.
  return (
    <a
      href={streetViewPanoramaUrl(photo.point)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t('detailStreetViewOpen')}
      className={cn(
        PHOTO_AREA_CLASS,
        'after:pointer-events-none after:absolute after:inset-0 after:z-10 focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-charcoal',
      )}
    >
      {image}
      <Badge variant="secondary" className="absolute bottom-2.5 left-2.5">
        {t('streetViewBadge')}
      </Badge>
      <Badge variant="secondary" className="absolute right-2.5 bottom-2.5">
        <Rotate3d aria-hidden />
        {t('photoExplorePanorama')}
      </Badge>
    </a>
  );
}
