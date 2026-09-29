import type { GeoPoint } from '@/core/geo/types';

export const STREET_VIEW_IMAGE_ROUTE = '/api/street-view';

// why: six decimals place a point within 10 cm; beyond that, two URLs for
// the same building would no longer share the browser cache.
function coordinate(value: number): string {
  return value.toFixed(6);
}

export function streetViewImagePath(point: GeoPoint): string {
  const query = new URLSearchParams({
    lat: coordinate(point.latitude),
    lon: coordinate(point.longitude),
  });
  return `${STREET_VIEW_IMAGE_ROUTE}?${query.toString()}`;
}

export function streetViewPanoramaUrl(point: GeoPoint): string {
  const query = new URLSearchParams({
    api: '1',
    map_action: 'pano',
    viewpoint: `${coordinate(point.latitude)},${coordinate(point.longitude)}`,
  });
  return `https://www.google.com/maps/@?${query.toString()}`;
}

// why: the Maps Embed API shows the panorama closest to `location`. Its key is
// a browser key restricted by referrer, never the server's Street View key.
export function streetViewEmbedUrl(point: GeoPoint, apiKey: string): string {
  const query = new URLSearchParams({
    key: apiKey,
    location: `${coordinate(point.latitude)},${coordinate(point.longitude)}`,
  });
  return `https://www.google.com/maps/embed/v1/streetview?${query.toString()}`;
}
