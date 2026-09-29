import 'server-only';

import { err, ok, type Result } from 'neverthrow';
import * as v from 'valibot';
import { type AppError, externalApi } from '@/core/errors';
import type { GeoPoint } from '@/core/geo/types';
import type { IStreetViewImagery } from '@/core/street-view/ports/street-view-imagery.port';
import type {
  NearestPanorama,
  StreetViewImage,
} from '@/core/street-view/types';
import { env } from '@/shared/env';
import { log } from '@/shared/logger';

const PROVIDER = 'google-street-view';
const IMAGE_SIZE = '640x320';
const SEARCH_RADIUS_M = '50';

// why: the photo only needs `status`; a panorama field Google leaves out or
// garbles fails the panorama lookup alone, never the photo.
const MetadataSchema = v.object({
  status: v.string(),
  pano_id: v.fallback(
    v.optional(v.pipe(v.string(), v.minLength(1))),
    undefined,
  ),
  location: v.fallback(
    v.optional(v.object({ lat: v.number(), lng: v.number() })),
    undefined,
  ),
});

type Metadata = v.InferOutput<typeof MetadataSchema>;

const NO_IMAGERY_STATUSES = new Set(['ZERO_RESULTS', 'NOT_FOUND']);

// why: without `heading`, Google aims the nearest panorama's camera at
// `location`. The photo faces the trusted point, not a random street.
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

// why: the metadata request is free, the image is billed. An image is only
// paid for when a panorama exists within 50 m of the point. The photo and the
// embedded panorama both come from this answer, so they show the same place.
async function nearestPanoramaMetadata(
  point: GeoPoint,
  key: string,
): Promise<Result<Metadata | null, AppError>> {
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
  if (status === 'OK') return ok(parsed.output);
  if (NO_IMAGERY_STATUSES.has(status)) return ok(null);
  return err(externalApi(PROVIDER, `Metadata answered ${status}`));
}

async function withKey<T>(
  call: (key: string) => Promise<Result<T, AppError>>,
): Promise<Result<T, AppError>> {
  const key = env().GOOGLE_MAPS_API_KEY;
  if (key === undefined) {
    return err(externalApi(PROVIDER, 'Street View is not configured'));
  }

  try {
    return await call(key);
  } catch (e) {
    log.warn('street_view.fetch.failed', {
      provider: PROVIDER,
      reason: e instanceof Error ? e.name : 'unknown',
    });
    return err(externalApi(PROVIDER, 'Street View did not answer'));
  }
}

function imageToward(
  point: GeoPoint,
): Promise<Result<StreetViewImage | null, AppError>> {
  return withKey(async (key) => {
    const found = await nearestPanoramaMetadata(point, key);
    if (found.isErr()) return err(found.error);
    if (found.value === null) return ok(null);

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
  });
}

function panoramaNear(
  point: GeoPoint,
): Promise<Result<NearestPanorama | null, AppError>> {
  return withKey(async (key) => {
    const found = await nearestPanoramaMetadata(point, key);
    if (found.isErr()) return err(found.error);
    if (found.value === null) return ok(null);

    const { pano_id: panoId, location } = found.value;
    if (panoId === undefined || location === undefined) {
      return err(externalApi(PROVIDER, 'Metadata names no panorama'));
    }
    return ok({
      panoId,
      location: { latitude: location.lat, longitude: location.lng },
    });
  });
}

export const googleStreetViewImagery: IStreetViewImagery = {
  imageToward,
  panoramaNear,
};
