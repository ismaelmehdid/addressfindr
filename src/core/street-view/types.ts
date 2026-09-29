import type { GeoPoint } from '@/core/geo/types';

export type StreetViewImage = {
  bytes: ArrayBuffer;
  contentType: string;
};

// why: the panorama Google picks for a point, where its camera stands.
export type NearestPanorama = {
  panoId: string;
  location: GeoPoint;
};

// why: the view the card photo shows, so the embedded panorama can open on it.
export type StreetViewPanorama = {
  panoId: string;
  heading: number;
};
