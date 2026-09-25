import 'server-only';

import { err, ok, type Result } from 'neverthrow';
import * as v from 'valibot';
import { type AppError, externalApi } from '@/core/errors';
import type { GeoPoint } from '@/core/geo/types';
import type { IStreetViewImagery } from '@/core/street-view/ports/street-view-imagery.port';
import type { StreetViewImage } from '@/core/street-view/types';
import { env } from '@/shared/env';
import { log } from '@/shared/logger';

const PROVIDER = 'google-street-view';
const IMAGE_SIZE = '640x320';
const SEARCH_RADIUS_M = '50';

const MetadataSchema = v.object({ status: v.string() });

const NO_IMAGERY_STATUSES = new Set(['ZERO_RESULTS', 'NOT_FOUND']);

// why: sans `heading`, Google oriente la camera du panorama le plus proche
// vers `location`. La photo regarde donc le point fiable, pas la rue au hasard.
function endpoint(path: '' | '/metadata', point: GeoPoint, key: string): URL {
  const url = new URL(`${env().GOOGLE_STREET_VIEW_BASE_URL}${path}`);
  url.searchParams.set('location', `${point.latitude},${point.longitude}`);
  url.searchParams.set('radius', SEARCH_RADIUS_M);
  url.searchParams.set('source', 'outdoor');
  url.searchParams.set('key', key);
  return url;
}

async function get(url: URL): Promise<Response> {
  return fetch(url, {
    method: 'GET',
    signal: AbortSignal.timeout(env().GOOGLE_STREET_VIEW_TIMEOUT_MS),
  });
}

// why: la requete de metadonnees est gratuite, l'image est facturee. On ne
// paie donc une image que si un panorama existe a moins de 50 m du point.
async function panoramaExists(
  point: GeoPoint,
  key: string,
): Promise<Result<boolean, AppError>> {
  const response = await get(endpoint('/metadata', point, key));
  if (!response.ok) {
    return err(
      externalApi(PROVIDER, `Metadata answered HTTP ${response.status}`),
    );
  }

  const parsed = v.safeParse(MetadataSchema, await response.json());
  if (!parsed.success) {
    return err(externalApi(PROVIDER, 'Metadata response is malformed'));
  }

  const { status } = parsed.output;
  if (status === 'OK') return ok(true);
  if (NO_IMAGERY_STATUSES.has(status)) return ok(false);
  return err(externalApi(PROVIDER, `Metadata answered ${status}`));
}

async function imageToward(
  point: GeoPoint,
): Promise<Result<StreetViewImage | null, AppError>> {
  const key = env().GOOGLE_MAPS_API_KEY;
  if (key === undefined) {
    return err(externalApi(PROVIDER, 'Street View is not configured'));
  }

  try {
    const exists = await panoramaExists(point, key);
    if (exists.isErr()) return err(exists.error);
    if (!exists.value) return ok(null);

    const url = endpoint('', point, key);
    url.searchParams.set('size', IMAGE_SIZE);
    url.searchParams.set('return_error_code', 'true');
    const response = await get(url);
    if (response.status === 404) return ok(null);
    if (!response.ok) {
      return err(
        externalApi(PROVIDER, `Image answered HTTP ${response.status}`),
      );
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.startsWith('image/')) {
      return err(externalApi(PROVIDER, 'Image response is not an image'));
    }

    return ok({ bytes: await response.arrayBuffer(), contentType });
  } catch (e) {
    log.warn('street_view.fetch.failed', {
      provider: PROVIDER,
      reason: e instanceof Error ? e.name : 'unknown',
    });
    return err(externalApi(PROVIDER, 'Street View did not answer'));
  }
}

export const googleStreetViewImagery: IStreetViewImagery = { imageToward };
