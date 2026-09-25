import 'server-only';

import { err, ok, type Result } from 'neverthrow';
import * as v from 'valibot';
import { type AppError, externalApi, validation } from '@/core/errors';
import type { IAddressGeocoder } from '@/core/geo/ports/address-geocoder.port';
import type { GeocodedAddress } from '@/core/geo/types';
import { env } from '@/shared/env';
import { log } from '@/shared/logger';

const PROVIDER = 'ban-geocoder';
const MAX_QUERY_CHARS = 200;

const FeatureSchema = v.object({
  geometry: v.object({
    coordinates: v.tuple([v.number(), v.number()]),
  }),
  properties: v.object({
    label: v.string(),
    score: v.number(),
    type: v.string(),
    housenumber: v.optional(v.nullable(v.string())),
    street: v.optional(v.nullable(v.string())),
    name: v.optional(v.nullable(v.string())),
    postcode: v.optional(v.nullable(v.string())),
    city: v.optional(v.nullable(v.string())),
    citycode: v.optional(v.nullable(v.string())),
    id: v.optional(v.nullable(v.string())),
  }),
});

const ResponseSchema = v.object({
  features: v.array(FeatureSchema),
});

function toAddress(
  feature: v.InferOutput<typeof FeatureSchema>,
): GeocodedAddress {
  const [longitude, latitude] = feature.geometry.coordinates;
  const p = feature.properties;
  return {
    label: p.label,
    houseNumber: p.housenumber ?? null,
    street: p.street ?? null,
    postalCode: p.postcode ?? null,
    city: p.city ?? null,
    inseeCode: p.citycode ?? null,
    banId: p.id ?? null,
    kind: p.type,
    score: p.score,
    point: { latitude, longitude },
  };
}

async function geocode(input: {
  query: string;
}): Promise<Result<GeocodedAddress | null, AppError>> {
  const query = input.query.trim().slice(0, MAX_QUERY_CHARS);
  if (query.length === 0) return err(validation('Empty address', 'query'));

  const url = new URL(`${env().GEOCODER_BASE_URL}/search`);
  url.searchParams.set('q', query);
  url.searchParams.set('limit', '1');

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(env().GEOCODER_TIMEOUT_MS),
    });
    if (!response.ok) {
      log.warn('geo.geocode.http_failure', { status: response.status });
      return err(externalApi(PROVIDER, `HTTP ${response.status}`));
    }

    const parsed = v.safeParse(ResponseSchema, await response.json());
    if (!parsed.success) {
      log.warn('geo.geocode.parse_failure', {
        issues: parsed.issues.map((i) => i.message).slice(0, 3),
      });
      return err(externalApi(PROVIDER, 'Unexpected response shape'));
    }

    const [best] = parsed.output.features;
    return ok(best === undefined ? null : toAddress(best));
  } catch (e) {
    if (e instanceof Error && e.name === 'TimeoutError') {
      return err(externalApi(PROVIDER, 'Request timed out'));
    }
    log.error('geo.geocode.exception', e);
    return err(externalApi(PROVIDER, 'Network or parser failure'));
  }
}

export const banGeocoder: IAddressGeocoder = { geocode };
