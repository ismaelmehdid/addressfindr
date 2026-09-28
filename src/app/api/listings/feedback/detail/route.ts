import { NextResponse } from 'next/server';
import { SubmitFeedbackDetailInputSchema } from '@/application/listing/feedback-dto';
import { submitFeedbackDetail } from '@/application/listing/submit-feedback-detail';
import { openRoute, parseJsonBody } from '@/shared/api-route';
import { jsonError } from '@/shared/errors-http';
import { log } from '@/shared/logger';

export async function POST(req: Request): Promise<Response> {
  const caller = await openRoute({
    req,
    rateLimit: 'listing-feedback',
    event: 'api.listings.feedback.detail',
  });
  if (!caller.ok) return caller.response;

  const body = await parseJsonBody(req, SubmitFeedbackDetailInputSchema);
  if (!body.ok) return body.response;

  const result = await submitFeedbackDetail(body.value);
  if (result.isErr()) {
    log.warn('api.listings.feedback.detail.failure', {
      code: result.error.code,
      message: result.error.message,
      authenticated: caller.caller.userId !== null,
    });
    return jsonError(result.error);
  }

  return NextResponse.json(result.value);
}
