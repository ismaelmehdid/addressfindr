import { NextResponse } from 'next/server';
import { FindAddressCandidatesInputSchema } from '@/application/ademe/dto';
import { findAddressCandidates } from '@/application/ademe/find-address-candidates';
import { openRoute, parseJsonBody, spendDailyCap } from '@/shared/api-route';
import { jsonError } from '@/shared/errors-http';
import { log } from '@/shared/logger';

export const maxDuration = 30;

export async function POST(req: Request): Promise<Response> {
  const caller = await openRoute({
    req,
    rateLimit: 'listing-match',
    event: 'api.listings.match',
  });
  if (!caller.ok) return caller.response;

  const body = await parseJsonBody(req, FindAddressCandidatesInputSchema);
  if (!body.ok) return body.response;

  const cap = await spendDailyCap({
    bucket: 'listing-match',
    event: 'api.listings.match',
  });
  if (!cap.ok) return cap.response;

  const result = await findAddressCandidates(body.value);
  if (result.isErr()) {
    log.warn('api.listings.match.failure', {
      code: result.error.code,
      message: result.error.message,
      authenticated: caller.caller.userId !== null,
    });
    return jsonError(result.error);
  }

  return NextResponse.json(result.value);
}
