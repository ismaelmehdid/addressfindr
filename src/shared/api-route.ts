import { NextResponse } from 'next/server';
import type { BaseIssue, BaseSchema } from 'valibot';
import * as v from 'valibot';
import { getCurrentUser } from '@/application/me/get-current-user';
import {
  applyRateLimit,
  type RateLimitBucket,
  type RateLimitRefusal,
} from '@/application/rate-limit/apply-rate-limit';
import {
  serviceUnavailable,
  unauthorized,
  unsupportedMediaType,
  validation,
} from '@/core/errors';
import { rateLimitIdentifier } from '@/shared/client-ip';
import { jsonError } from '@/shared/errors-http';
import { log } from '@/shared/logger';

export type AuthedRouteContext = {
  userId: string;
};

function rateLimitRefusal(args: {
  refusal: RateLimitRefusal;
  event: string;
  context: Record<string, unknown>;
}): Response {
  if (args.refusal.reason === 'unavailable') {
    log.warn(`${args.event}.rate_limit_unavailable`, args.context);
    return jsonError(serviceUnavailable('Rate limiter unavailable'));
  }
  log.warn(`${args.event}.rate_limited`, {
    ...args.context,
    reset: args.refusal.reset,
  });
  return NextResponse.json(
    { error: 'rate_limited', reset: args.refusal.reset },
    { status: 429 },
  );
}

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
  const identifier = me.value.id;
  const rl = await applyRateLimit({ identifier, limit: args.rateLimit });
  if (!rl.success) {
    return {
      ok: false,
      response: rateLimitRefusal({
        refusal: rl,
        event: args.event,
        context: { userId: me.value.id },
      }),
    };
  }
  return {
    ok: true,
    ctx: { userId: me.value.id },
  };
}

export type RouteCaller = {
  userId: string | null;
};

// Same shape as requireAuthedRoute for a route that also serves anonymous
// callers: no identity is demanded, but the rate limit still applies, keyed on
// the client address when there is no user to key on.
export async function openRoute(args: {
  req: Request;
  rateLimit: RateLimitBucket;
  event: string;
}): Promise<
  { ok: true; caller: RouteCaller } | { ok: false; response: Response }
> {
  const me = await getCurrentUser();
  const userId = me.isOk() ? me.value.id : null;
  const rl = await applyRateLimit({
    identifier: rateLimitIdentifier({ req: args.req, userId }),
    limit: args.rateLimit,
  });
  if (!rl.success) {
    return {
      ok: false,
      response: rateLimitRefusal({
        refusal: rl,
        event: args.event,
        context: { authenticated: userId !== null },
      }),
    };
  }
  return { ok: true, caller: { userId } };
}

function isJsonMediaType(contentType: string | null): boolean {
  const mediaType = contentType?.split(';')[0]?.trim().toLowerCase();
  return mediaType === 'application/json';
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
  if (!isJsonMediaType(req.headers.get('content-type'))) {
    return {
      ok: false,
      response: jsonError(
        unsupportedMediaType('Request body must be application/json'),
      ),
    };
  }

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
