import 'server-only';

import { err, ok, type Result } from 'neverthrow';
import * as v from 'valibot';
import { type AppError, parseInput } from '@/core/errors';
import type { IAddressGeocoder } from '@/core/geo/ports/address-geocoder.port';
import type { GeocodedAddress } from '@/core/geo/types';
import {
  parseRawStreetLine,
  verifyGeocodedAddress,
} from '@/core/geo/verify-geocoded-address';
import { banGeocoder } from '@/infra/external-apis/ban-geocoder/ban-geocoder';
import { log } from '@/shared/logger';

const VerifyRawAddressInputSchema = v.object({
  rawStreet: v.pipe(v.string(), v.maxLength(500)),
  postalCode: v.nullable(v.pipe(v.string(), v.maxLength(10))),
  city: v.nullable(v.pipe(v.string(), v.maxLength(100))),
  inseeCode: v.pipe(v.string(), v.length(5)),
});

export type VerifyRawAddressInput = v.InferOutput<
  typeof VerifyRawAddressInputSchema
>;

// why: an address typed by hand is only trusted once the national address
// register recognises the same door. `null` means "not verified" — the
// caller must then drop the address, never show it as typed.
export async function verifyRawAddress(
  input: VerifyRawAddressInput,
  deps: { geocoder?: IAddressGeocoder } = {},
): Promise<Result<GeocodedAddress | null, AppError>> {
  const parsed = parseInput(
    VerifyRawAddressInputSchema,
    input,
    'Invalid raw address',
  );
  if (parsed.isErr()) return err(parsed.error);

  const line = parseRawStreetLine(parsed.value.rawStreet);
  if (line === null) return ok(null);

  const query = [
    line.houseNumber,
    line.streetType,
    ...line.words,
    parsed.value.postalCode,
    parsed.value.city,
  ]
    .filter((part): part is string => part !== null && part.length > 0)
    .join(' ');

  log.info('geo.verify_raw_address.start', { inseeCode: input.inseeCode });

  const geocoded = await (deps.geocoder ?? banGeocoder).geocode({ query });
  if (geocoded.isErr()) {
    log.warn('geo.verify_raw_address.failed', { code: geocoded.error.code });
    return err(geocoded.error);
  }
  if (geocoded.value === null) return ok(null);

  const verified = verifyGeocodedAddress({
    raw: line,
    geocoded: geocoded.value,
    inseeCode: parsed.value.inseeCode,
  });
  log.info('geo.verify_raw_address.success', {
    verified,
    score: geocoded.value.score,
  });
  return ok(verified ? geocoded.value : null);
}
