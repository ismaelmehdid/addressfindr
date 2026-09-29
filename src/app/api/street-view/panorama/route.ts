import { NextResponse } from 'next/server';
import { getStreetViewPanorama } from '@/application/street-view/get-street-view-panorama';
import { notFound } from '@/core/errors';
import { openRoute } from '@/shared/api-route';
import { jsonError } from '@/shared/errors-http';
import { log } from '@/shared/logger';

export const maxDuration = 20;

export async function GET(req: Request): Promise<Response> {
  const caller = await openRoute({
    req,
    rateLimit: 'street-view',
    event: 'api.street_view.panorama',
  });
  if (!caller.ok) return caller.response;

  const query = new URL(req.url).searchParams;
  const result = await getStreetViewPanorama({
    lat: query.get('lat') ?? '',
    lon: query.get('lon') ?? '',
  });
  if (result.isErr()) {
    log.warn('api.street_view.panorama.failure', {
      code: result.error.code,
      message: result.error.message,
      authenticated: caller.caller.userId !== null,
    });
    return jsonError(result.error);
  }

  if (result.value === null) {
    return jsonError(notFound('No Street View panorama near this point'));
  }

  return NextResponse.json(result.value, {
    headers: { 'cache-control': 'private, max-age=3600' },
  });
}
