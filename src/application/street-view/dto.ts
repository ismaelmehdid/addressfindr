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
// spend billed Street View images.
export const GetStreetViewImageInputSchema = v.pipe(
  v.object({ lat: CoordinateSchema, lon: CoordinateSchema }),
  v.transform(({ lat, lon }) => ({ latitude: lat, longitude: lon })),
  v.check(isWithinMetropolitanFrance, 'Point is outside metropolitan France'),
);

export type GetStreetViewImageInput = v.InferInput<
  typeof GetStreetViewImageInputSchema
>;
