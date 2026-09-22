import { NextResponse } from 'next/server';
import { ExtractListingInputSchema } from '@/application/listing/dto';
import { extractListing } from '@/application/listing/extract-listing';
import { openRoute, parseJsonBody } from '@/shared/api-route';
import { jsonError } from '@/shared/errors-http';
import { log } from '@/shared/logger';

export const maxDuration = 90;

export async function POST(req: Request): Promise<Response> {
  const caller = await openRoute({
    req,
    rateLimit: 'listing-extract',
    event: 'api.listings.extract',
  });
  if (!caller.ok) return caller.response;

  const body = await parseJsonBody(req, ExtractListingInputSchema);
  if (!body.ok) return body.response;

  const result = await extractListing(body.value);
  if (result.isErr()) {
    log.warn('api.listings.extract.failure', {
      code: result.error.code,
      message: result.error.message,
      authenticated: caller.caller.userId !== null,
    });
    return jsonError(result.error);
  }

  return NextResponse.json({
    fields: result.value.fields,
    sources: result.value.sources,
  });
}
