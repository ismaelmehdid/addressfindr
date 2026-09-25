import type { Result } from 'neverthrow';
import type { AppError } from '@/core/errors';
import type { GeocodedAddress } from '../types';

export interface IAddressGeocoder {
  // why: `null` is a normal answer — the geocoder found nothing — and never a
  // failure. Only a transport or parsing problem is an error.
  geocode(input: {
    query: string;
  }): Promise<Result<GeocodedAddress | null, AppError>>;
}
