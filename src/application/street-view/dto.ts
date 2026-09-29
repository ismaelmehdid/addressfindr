import * as v from 'valibot';
import { isWithinMetropolitanFrance } from '@/core/geo/resolve-mappable-point';

const CoordinateSchema = v.pipe(
  v.string(),
  v.regex(/^-?\d{1,3}(\.\d{1,8})?$/, 'Coordinate must be a decimal degree'),
  v.transform(Number),
  v.number(),
);

// why: points shown on the map already passed core/geo's metropolitan
// bounding box. A point outside it cannot come from the UI, and must not
// reach Google, whose images are billed.
export const StreetViewPointInputSchema = v.pipe(
  v.object({ lat: CoordinateSchema, lon: CoordinateSchema }),
  v.transform(({ lat, lon }) => ({ latitude: lat, longitude: lon })),
  v.check(isWithinMetropolitanFrance, 'Point is outside metropolitan France'),
);

export type StreetViewPointInput = v.InferInput<
  typeof StreetViewPointInputSchema
>;

// why: what /api/street-view/panorama answers; the UI validates it before
// building the embed from it.
export const StreetViewPanoramaSchema = v.object({
  panoId: v.pipe(v.string(), v.minLength(1)),
  heading: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(359)),
});
