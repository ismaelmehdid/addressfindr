import { NextResponse } from 'next/server';
import * as v from 'valibot';
import { type RedeemResult, redeem } from '@/application/early-access/redeem';
import { getCurrentUser } from '@/application/me/get-current-user';
import { applyRateLimit } from '@/application/rate-limit/apply-rate-limit';
import { unauthorized } from '@/core/errors';
import { parseJsonBody } from '@/shared/api-route';
import { jsonError } from '@/shared/errors-http';
import { log } from '@/shared/logger';

const BodySchema = v.object({
  code: v.string(),
});

const ERROR_STATUS: Record<
  Extract<RedeemResult, { success: false }>['error'],
  number
> = {
  unauthenticated: 401,
  invalid_input: 400,
  invalid_code: 400,
  unknown: 500,
};

export async function POST(req: Request): Promise<Response> {
  // Own rate-limit namespace, distinct from the shared 'default' bucket other routes use.
  const me = await getCurrentUser();
  if (me.isErr()) return jsonError(unauthorized(me.error.message));

  const rate = await applyRateLimit({
    identifier: `early_access:redeem:${me.value.id}`,
    limit: 'default',
  });
  if (!rate.success) {
    log.warn('api.early_access.redeem.rate_limited', {
      userId: me.value.id,
      reset: rate.reset,
    });
    return NextResponse.json(
      { error: 'rate_limited', reset: rate.reset },
      { status: 429 },
    );
  }

  const body = await parseJsonBody(req, BodySchema);
  if (!body.ok) return body.response;

  log.info('api.early_access.redeem.request', { userId: me.value.id });

  const result = await redeem(body.value);
  if (!result.success) {
    log.warn('api.early_access.redeem.failure', {
      userId: me.value.id,
      reason: result.error,
    });
    return NextResponse.json(result, { status: ERROR_STATUS[result.error] });
  }

  log.info('api.early_access.redeem.success', { userId: me.value.id });
  return NextResponse.json(result);
}
