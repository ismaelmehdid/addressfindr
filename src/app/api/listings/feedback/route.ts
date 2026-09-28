import { NextResponse } from 'next/server';
import { SubmitFeedbackInputSchema } from '@/application/listing/feedback-dto';
import { submitFeedback } from '@/application/listing/submit-feedback';
import { openRoute, parseJsonBody } from '@/shared/api-route';
import { jsonError } from '@/shared/errors-http';
import { log } from '@/shared/logger';

export async function POST(req: Request): Promise<Response> {
  const caller = await openRoute({
    req,
    rateLimit: 'listing-feedback',
    event: 'api.listings.feedback',
  });
  if (!caller.ok) return caller.response;

  const body = await parseJsonBody(req, SubmitFeedbackInputSchema);
  if (!body.ok) return body.response;

  const result = await submitFeedback(body.value);
  if (result.isErr()) {
    log.warn('api.listings.feedback.failure', {
      code: result.error.code,
      message: result.error.message,
      authenticated: caller.caller.userId !== null,
    });
    return jsonError(result.error);
  }

  return NextResponse.json(result.value);
}
