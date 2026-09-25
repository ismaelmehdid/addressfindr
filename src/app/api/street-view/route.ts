import { getStreetViewImage } from '@/application/street-view/get-street-view-image';
import { notFound } from '@/core/errors';
import { openRoute } from '@/shared/api-route';
import { jsonError } from '@/shared/errors-http';
import { log } from '@/shared/logger';

export const maxDuration = 20;

export async function GET(req: Request): Promise<Response> {
  const caller = await openRoute({
    req,
    rateLimit: 'street-view',
    event: 'api.street_view',
  });
  if (!caller.ok) return caller.response;

  const query = new URL(req.url).searchParams;
  const result = await getStreetViewImage({
    lat: query.get('lat') ?? '',
    lon: query.get('lon') ?? '',
  });
  if (result.isErr()) {
    log.warn('api.street_view.failure', {
      code: result.error.code,
      message: result.error.message,
      authenticated: caller.caller.userId !== null,
    });
    return jsonError(result.error);
  }

  if (result.value === null) {
    return jsonError(notFound('No Street View imagery near this point'));
  }

  // why: les conditions Google interdisent de stocker l'imagerie cote
  // serveur ; seul le navigateur la garde, le temps d'une session.
  return new Response(result.value.bytes, {
    headers: {
      'content-type': result.value.contentType,
      'cache-control': 'private, max-age=3600',
    },
  });
}
