import 'server-only';

import { ok, type Result } from 'neverthrow';
import * as v from 'valibot';
import { type ParcelArea, parcelKeyOf } from '@/core/ademe/land-surface';
import type { IParcelDirectory } from '@/core/ademe/ports/parcel-directory.port';
import type { AppError } from '@/core/errors';
import { env } from '@/shared/env';
import { log } from '@/shared/logger';

const PROVIDER = 'cadastre';
const MAX_PARCEL_LOOKUPS = 25;

const FeatureCollectionSchema = v.object({
  features: v.optional(
    v.array(
      v.object({
        properties: v.optional(
          v.object({ contenance: v.optional(v.nullable(v.number())) }),
        ),
      }),
    ),
    [],
  ),
});

async function areaOf(parcelId: string): Promise<ParcelArea | null> {
  const key = parcelKeyOf(parcelId);
  if (key === null) return null;

  const url = new URL(`${env().CADASTRE_BASE_URL}/api/cadastre/parcelle`);
  url.searchParams.set('code_insee', key.inseeCode);
  url.searchParams.set('section', key.section);
  url.searchParams.set('numero', key.number);
  url.searchParams.set('_limit', '1');

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(env().CADASTRE_TIMEOUT_MS),
    });
    if (!response.ok) {
      log.warn('parcel.lookup.http_failure', {
        provider: PROVIDER,
        status: response.status,
      });
      return null;
    }

    const parsed = v.safeParse(FeatureCollectionSchema, await response.json());
    if (!parsed.success) {
      log.warn('parcel.lookup.parse_failure', { provider: PROVIDER });
      return null;
    }

    const contenance = parsed.output.features[0]?.properties?.contenance;
    return {
      parcelId,
      areaM2: typeof contenance === 'number' ? contenance : null,
    };
  } catch (e) {
    // why: le cadastre complete un complement. Son echec sur une parcelle ne
    // doit ni echouer la recherche, ni masquer les autres parcelles.
    log.warn('parcel.lookup.failed', {
      provider: PROVIDER,
      reason: e instanceof Error ? e.name : 'unknown',
    });
    return null;
  }
}

async function areasFor(input: {
  parcelIds: readonly string[];
}): Promise<Result<ParcelArea[], AppError>> {
  const wanted = [...new Set(input.parcelIds)].slice(0, MAX_PARCEL_LOOKUPS);
  if (wanted.length === 0) return ok([]);

  log.info('parcel.lookup.start', { parcels: wanted.length });
  const settled = await Promise.all(wanted.map(areaOf));
  const areas = settled.filter((area): area is ParcelArea => area !== null);

  log.info('parcel.lookup.success', {
    parcels: wanted.length,
    found: areas.length,
  });
  return ok(areas);
}

export const cadastreParcelDirectory: IParcelDirectory = { areasFor };
