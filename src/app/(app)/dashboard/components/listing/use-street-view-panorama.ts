'use client';

import { useEffect, useState } from 'react';
import * as v from 'valibot';
import { StreetViewPanoramaSchema } from '@/application/street-view/dto';
import type { GeoPoint } from '@/core/geo/types';
import { streetViewPanoramaLookupPath } from '@/core/street-view/links';

type StreetViewPanorama = v.InferOutput<typeof StreetViewPanoramaSchema>;

export type PanoramaLookup =
  | { kind: 'locating' }
  | { kind: 'located'; panorama: StreetViewPanorama | null };

const LOOKUP_TIMEOUT_MS = 5000;

// why: any failure answers null, and the embed then searches the point the
// way the photo did; the panorama never waits on the lookup for good.
async function requestPanorama(
  path: string,
): Promise<StreetViewPanorama | null> {
  try {
    const response = await fetch(path, {
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const parsed = v.safeParse(StreetViewPanoramaSchema, await response.json());
    return parsed.success ? parsed.output : null;
  } catch {
    return null;
  }
}

// why: looked up only once exploring starts; paging through the results
// never spends a request on a panorama nobody explores.
export function useStreetViewPanorama({
  point,
  enabled,
}: {
  point: GeoPoint;
  enabled: boolean;
}): PanoramaLookup {
  const path = streetViewPanoramaLookupPath(point);
  const [answer, setAnswer] = useState<{
    path: string;
    panorama: StreetViewPanorama | null;
  } | null>(null);
  const answered = answer !== null && answer.path === path;

  useEffect(() => {
    if (!enabled || answered) return;
    let current = true;
    void requestPanorama(path).then((panorama) => {
      if (current) setAnswer({ path, panorama });
    });
    return (): void => {
      current = false;
    };
  }, [enabled, answered, path]);

  return answered
    ? { kind: 'located', panorama: answer.panorama }
    : { kind: 'locating' };
}
