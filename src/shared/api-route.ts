import { NextResponse } from 'next/server';
import type { BaseIssue, BaseSchema } from 'valibot';
import * as v from 'valibot';
import { getCurrentUser } from '@/application/me/get-current-user';
import {
  applyDailyCap,
  applyRateLimit,
  type DailyCappedBucket,
  type RateLimitBucket,
  type RateLimitRefusal,
} from '@/application/rate-limit/apply-rate-limit';
import {
  forbidden,
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

const ACCEPTED_FETCH_SITES: ReadonlySet<string> = new Set([
  'same-origin',
  'none',
]);

function firstListValue(header: string | null): string | null {
  const first = header?.split(',')[0]?.trim();
  return first ? first : null;
}

// why: req.url can carry the server's own bind host; behind the Vercel proxy
// the public host is x-forwarded-host, as in Next's server-action origin check.
function requestHost(req: Request): string {
  const host =
    firstListValue(req.headers.get('x-forwarded-host')) ??
    req.headers.get('host') ??
    new URL(req.url).host;
  return host.toLowerCase();
}

function originHost(origin: string): string | null {
  try {
    return new URL(origin).host;
  } catch {
    return null;
  }
}

// why: an <img> or a text/plain POST from another site needs no preflight, so
// without this any page could spend paid credit from its visitors' browsers.
// A request with neither header comes from a non-browser client.
function isSameOriginRequest(req: Request): boolean {
  const fetchSite = req.headers.get('sec-fetch-site');
  if (fetchSite !== null) return ACCEPTED_FETCH_SITES.has(fetchSite);
  const origin = req.headers.get('origin');
  if (origin === null) return true;
  return originHost(origin) === requestHost(req);
}

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
  if (!isSameOriginRequest(args.req)) {
    log.warn(`${args.event}.cross_site_refused`, {
      fetchSite: args.req.headers.get('sec-fetch-site'),
      origin: args.req.headers.get('origin'),
    });
    return {
      ok: false,
      response: jsonError(forbidden('Cross-site request refused')),
    };
  }

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

// why: the daily cap is shared by every caller, so a route spends it only
// after validating its input, right before the paid call.
export async function spendDailyCap(args: {
  bucket: DailyCappedBucket;
  event: string;
}): Promise<{ ok: true } | { ok: false; response: Response }> {
  const cap = await applyDailyCap({ bucket: args.bucket });
  if (cap.success) return { ok: true };
  return {
    ok: false,
    response: rateLimitRefusal({
      refusal: cap,
      event: args.event,
      context: { scope: 'daily' },
    }),
  };
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
