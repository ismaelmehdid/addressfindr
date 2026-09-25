import * as v from 'valibot';
import { isWithinMetropolitanFrance } from '@/core/geo/resolve-mappable-point';

const CoordinateSchema = v.pipe(
  v.string(),
  v.regex(/^-?\d{1,3}(\.\d{1,8})?$/, 'Coordinate must be a decimal degree'),
  v.transform(Number),
  v.number(),
);

// why: les points montres sur la carte ont deja passe la bbox metropole de
// core/geo. Un point hors de cette bbox ne vient donc pas de l'UI, et ne doit
// pas faire consommer d'images Street View facturees.
export const GetStreetViewImageInputSchema = v.pipe(
  v.object({ lat: CoordinateSchema, lon: CoordinateSchema }),
  v.transform(({ lat, lon }) => ({ latitude: lat, longitude: lon })),
  v.check(isWithinMetropolitanFrance, 'Point is outside metropolitan France'),
);

export type GetStreetViewImageInput = v.InferInput<
  typeof GetStreetViewImageInputSchema
>;
