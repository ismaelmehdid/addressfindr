'use client';

import { useState } from 'react';
import { aerialImageUrl } from '@/core/geo/aerial-image';
import type { GeoPoint } from '@/core/geo/types';
import { streetViewImagePath } from '@/core/street-view/links';

export type CandidatePhoto =
  | { kind: 'street-view'; src: string; point: GeoPoint }
  | { kind: 'aerial'; src: string }
  | { kind: 'none' };

type PhotoSource = Exclude<CandidatePhoto, { kind: 'none' }>;

const NO_PHOTO: CandidatePhoto = { kind: 'none' };

// why: a photo only ever points at a trusted point (CLAUDE.md). Street View
// comes first; the IGN orthophoto stands in when there is no panorama within
// 50 m or no Google key.
function photoSources({
  point,
  streetViewEnabled,
}: {
  point: GeoPoint | null;
  streetViewEnabled: boolean;
}): readonly PhotoSource[] {
  if (point === null) return [];
  const aerial: PhotoSource = { kind: 'aerial', src: aerialImageUrl(point) };
  if (!streetViewEnabled) return [aerial];
  return [
    { kind: 'street-view', src: streetViewImagePath(point), point },
    aerial,
  ];
}

export function useCandidatePhoto(input: {
  point: GeoPoint | null;
  streetViewEnabled: boolean;
}): { photo: CandidatePhoto; onPhotoError: () => void } {
  const [failed, setFailed] = useState<readonly PhotoSource['kind'][]>([]);
  const photo =
    photoSources(input).find((source) => !failed.includes(source.kind)) ??
    NO_PHOTO;

  function onPhotoError(): void {
    if (photo.kind === 'none') return;
    const { kind } = photo;
    setFailed((current) =>
      current.includes(kind) ? current : [...current, kind],
    );
  }

  return { photo, onPhotoError };
}
