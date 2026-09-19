import { NextResponse } from 'next/server';
import type { BaseIssue, BaseSchema } from 'valibot';
import * as v from 'valibot';
import { getCurrentUser } from '@/application/me/get-current-user';
import {
  applyRateLimit,
  type RateLimitBucket,
} from '@/application/rate-limit/apply-rate-limit';
import { forbidden, unauthorized, validation } from '@/core/errors';
import { jsonError } from '@/shared/errors-http';
import { log } from '@/shared/logger';

export type AuthedRouteContext = {
  userId: string;
};

export async function requireAuthedRoute(args: {
  rateLimit: RateLimitBucket;
  event: string;
}): Promise<
  { ok: true; ctx: AuthedRouteContext } | { ok: false; response: Response }
> {
  const me = await getCurrentUser();
  if (me.isErr()) {
    return { ok: false, response: jsonError(unauthorized(me.error.message)) };
  }
  if (!me.value.hasRedeemedAccess) {
    return {
      ok: false,
      response: jsonError(forbidden('Early access required')),
    };
  }
  const identifier = me.value.id;
  const rl = await applyRateLimit({ identifier, limit: args.rateLimit });
  if (!rl.success) {
    log.warn(`${args.event}.rate_limited`, {
      userId: me.value.id,
      reset: rl.reset,
    });
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'rate_limited', reset: rl.reset },
        { status: 429 },
      ),
    };
  }
  return {
    ok: true,
    ctx: { userId: me.value.id },
  };
}

export async function parseJsonBody<
  TSchema extends BaseSchema<unknown, unknown, BaseIssue<unknown>>,
>(
  req: Request,
  schema: TSchema,
): Promise<
  | { ok: true; value: v.InferOutput<TSchema> }
  | { ok: false; response: Response }
> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return {
      ok: false,
      response: jsonError(validation('Request body is not valid JSON')),
    };
  }
  const parsed = v.safeParse(schema, body);
  if (!parsed.success) {
    const first = parsed.issues[0];
    return {
      ok: false,
      response: jsonError(
        validation(
          first?.message ?? 'Invalid request body',
          String(first?.path?.[0]?.key ?? ''),
        ),
      ),
    };
  }
  return { ok: true, value: parsed.output };
}
