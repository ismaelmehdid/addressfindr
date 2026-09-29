import type { Result } from 'neverthrow';
import type { AppError } from '@/core/errors';
import type { GeoPoint } from '@/core/geo/types';
import type { NearestPanorama, StreetViewImage } from '../types';

export interface IStreetViewImagery {
  imageToward(
    point: GeoPoint,
  ): Promise<Result<StreetViewImage | null, AppError>>;
  panoramaNear(
    point: GeoPoint,
  ): Promise<Result<NearestPanorama | null, AppError>>;
}
