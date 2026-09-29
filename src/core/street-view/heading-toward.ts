import type { GeoPoint } from '@/core/geo/types';

function radians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

// why: the Static API aims the camera from the panorama at the point when no
// heading is given; the embed documents no such default, so it is computed.
// Initial great-circle bearing in whole degrees clockwise from north, [0, 360).
export function headingToward({
  from,
  to,
}: {
  from: GeoPoint;
  to: GeoPoint;
}): number {
  const fromLatitude = radians(from.latitude);
  const toLatitude = radians(to.latitude);
  const deltaLongitude = radians(to.longitude - from.longitude);
  const y = Math.sin(deltaLongitude) * Math.cos(toLatitude);
  const x =
    Math.cos(fromLatitude) * Math.sin(toLatitude) -
    Math.sin(fromLatitude) * Math.cos(toLatitude) * Math.cos(deltaLongitude);
  const degrees = (Math.atan2(y, x) * 180) / Math.PI;
  return Math.round(degrees + 360) % 360;
}
