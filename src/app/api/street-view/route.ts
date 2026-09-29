import { StreetViewPointInputSchema } from '@/application/street-view/dto';
import { getStreetViewImage } from '@/application/street-view/get-street-view-image';
import { notFound, parseInput } from '@/core/errors';
import { openRoute, spendDailyCap } from '@/shared/api-route';
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
  const point = { lat: query.get('lat') ?? '', lon: query.get('lon') ?? '' };
  const valid = parseInput(
    StreetViewPointInputSchema,
    point,
    'Invalid Street View point',
  );
  if (valid.isErr()) {
    log.warn('api.street_view.invalid_point', {
      message: valid.error.message,
      authenticated: caller.caller.userId !== null,
    });
    return jsonError(valid.error);
  }

  const cap = await spendDailyCap({
    bucket: 'street-view',
    event: 'api.street_view',
  });
  if (!cap.ok) return cap.response;

  const result = await getStreetViewImage(point);
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

  // why: Google's terms forbid storing the imagery server-side; only the
  // browser keeps it, for the length of a session.
  return new Response(result.value.bytes, {
    headers: {
      'content-type': result.value.contentType,
      'cache-control': 'private, max-age=3600',
    },
  });
}
