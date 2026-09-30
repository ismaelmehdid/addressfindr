import type { GeoPoint } from '@/core/geo/types';
import type { StreetViewPanorama } from './types';

export const STREET_VIEW_IMAGE_ROUTE = '/api/street-view';
export const STREET_VIEW_PANORAMA_ROUTE = '/api/street-view/panorama';

// why: the same search as the card photo (google-street-view-imagery.ts), so
// an embed that falls back to the point never snaps to an indoor photosphere.
const PHOTO_SEARCH_RADIUS_M = '50';
const PHOTO_SOURCE = 'outdoor';

// why: six decimals place a point within 10 cm; beyond that, two URLs for
// the same building would no longer share the browser cache.
function coordinate(value: number): string {
  return value.toFixed(6);
}

function pointQuery(point: GeoPoint): URLSearchParams {
  return new URLSearchParams({
    lat: coordinate(point.latitude),
    lon: coordinate(point.longitude),
  });
}

export function streetViewImagePath(point: GeoPoint): string {
  return `${STREET_VIEW_IMAGE_ROUTE}?${pointQuery(point).toString()}`;
}

export function streetViewPanoramaLookupPath(point: GeoPoint): string {
  return `${STREET_VIEW_PANORAMA_ROUTE}?${pointQuery(point).toString()}`;
}

function latLon(point: GeoPoint): string {
  return `${coordinate(point.latitude)},${coordinate(point.longitude)}`;
}

function panoramaView(
  panorama: StreetViewPanorama | null,
): Record<string, string> {
  return panorama === null
    ? {}
    : { pano: panorama.panoId, heading: String(panorama.heading) };
}

export function streetViewPanoramaUrl(point: GeoPoint): string {
  const query = new URLSearchParams({
    api: '1',
    map_action: 'pano',
    viewpoint: latLon(point),
  });
  return `https://www.google.com/maps/@?${query.toString()}`;
}

// why: the embed opens on the photo's own panorama, aimed at the point, when
// it is known. The outdoor search around the point is always sent too: Google
// only uses it when there is no id or the id no longer resolves. Its key is a
// browser key restricted by referrer, never the server's Street View key.
export function streetViewEmbedUrl({
  point,
  apiKey,
  panorama,
}: {
  point: GeoPoint;
  apiKey: string;
  panorama: StreetViewPanorama | null;
}): string {
  const query = new URLSearchParams({
    key: apiKey,
    location: latLon(point),
    radius: PHOTO_SEARCH_RADIUS_M,
    source: PHOTO_SOURCE,
    ...panoramaView(panorama),
  });
  return `https://www.google.com/maps/embed/v1/streetview?${query.toString()}`;
}
