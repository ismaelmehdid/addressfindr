import 'server-only';

import { Ratelimit } from '@upstash/ratelimit';
import { getRedisClient } from '@/infra/external-apis/redis/client';
import { env } from '@/shared/env';
import { log } from '@/shared/logger';

export type RateLimitBucket =
  | 'default'
  | 'upload'
  | 'transcribe'
  | 'listing-extract'
  | 'listing-match'
  | 'street-view'
  | 'listing-feedback';

export type DailyCappedBucket = Extract<
  RateLimitBucket,
  'listing-extract' | 'listing-match' | 'street-view'
>;

export type RateLimitRefusal =
  | { success: false; reason: 'limited'; reset: number }
  | { success: false; reason: 'unavailable' };

export type RateLimitResult =
  | { success: true; remaining: number; reset: number }
  | RateLimitRefusal;

const PER_CALLER_PER_MINUTE: Record<RateLimitBucket, number> = {
  default: 60,
  upload: 20,
  transcribe: 30,
  'listing-extract': 10,
  'listing-match': 20,
  // why: a search shows up to 10 addresses, so 10 photos. 60 a minute leaves
  // six searches a minute without opening the billed key to abuse.
  'street-view': 60,
  // why: a displayed result sends at most two feedback calls, the verdict and
  // its detail. 20 a minute absorbs retries without letting one caller flood
  // the table.
  'listing-feedback': 20,
};

// why: each of these fronts a provider billed per call (Firecrawl and Groq,
// Google, OpenAI) or ADEME's heaviest reads, so it refuses rather than runs
// unlimited when Redis is down in production.
const PAID_BUCKETS: ReadonlySet<RateLimitBucket> = new Set([
  'listing-extract',
  'listing-match',
  'street-view',
  'transcribe',
]);

const DAILY_CAP_IDENTIFIER = 'global';

const UNLIMITED: RateLimitResult = {
  success: true,
  remaining: Number.POSITIVE_INFINITY,
  reset: 0,
};

function dailyCap(bucket: DailyCappedBucket): number {
  const e = env();
  const caps: Record<DailyCappedBucket, number> = {
    'listing-extract': e.RATE_LIMIT_DAILY_LISTING_EXTRACT,
    'listing-match': e.RATE_LIMIT_DAILY_LISTING_MATCH,
    'street-view': e.RATE_LIMIT_DAILY_STREET_VIEW,
  };
  return caps[bucket];
}

type RatelimitWindow = ReturnType<typeof Ratelimit.fixedWindow>;

const globalForRateLimit = globalThis as unknown as {
  rateLimiters: Map<string, Ratelimit | null> | undefined;
};

// why: Upstash keys a counter on prefix + identifier + window. With a shared
// prefix every bucket incremented the same counter: one search's photos
// exhausted the next search's extraction quota.
function cachedRatelimit(
  prefix: string,
  window: () => RatelimitWindow,
): Ratelimit | null {
  globalForRateLimit.rateLimiters ??= new Map();
  const cache = globalForRateLimit.rateLimiters;
  if (cache.has(prefix)) return cache.get(prefix) ?? null;

  const redis = getRedisClient();
  const limiter = redis
    ? new Ratelimit({ redis, limiter: window(), prefix, analytics: false })
    : null;
  cache.set(prefix, limiter);
  return limiter;
}

// why: "production" is VERCEL_ENV, as for auth cookies and billing. Previews
// sit behind Vercel's deployment protection and keep failing open.
function whenRedisUnavailable(input: {
  identifier: string;
  limit: RateLimitBucket;
}): RateLimitResult {
  if (PAID_BUCKETS.has(input.limit) && env().VERCEL_ENV === 'production') {
    log.error(
      'rate_limit.refused.redis_unavailable',
      new Error('Redis unavailable in front of a paid route'),
      { identifier: input.identifier, limit: input.limit },
    );
    return { success: false, reason: 'unavailable' };
  }
  log.warn('rate_limit.skipped.redis_unavailable', {
    identifier: input.identifier,
    limit: input.limit,
  });
  return UNLIMITED;
}

async function consume(input: {
  limiter: Ratelimit | null;
  identifier: string;
  limit: RateLimitBucket;
}): Promise<RateLimitResult> {
  if (!input.limiter) return whenRedisUnavailable(input);
  try {
    const result = await input.limiter.limit(input.identifier);
    // why: Upstash resolves a Redis timeout as a success. It is an outage.
    if (result.reason === 'timeout') throw new Error('Rate limit timed out');
    if (!result.success) {
      return { success: false, reason: 'limited', reset: result.reset };
    }
    return { success: true, remaining: result.remaining, reset: result.reset };
  } catch (error) {
    log.error(
      'rate_limit.error',
      error instanceof Error ? error : new Error(String(error)),
      { identifier: input.identifier, limit: input.limit },
    );
    return whenRedisUnavailable(input);
  }
}

export async function applyRateLimit(input: {
  identifier: string;
  limit: RateLimitBucket;
}): Promise<RateLimitResult> {
  if (env().NODE_ENV === 'development') return UNLIMITED;

  const limiter = cachedRatelimit(`app:ratelimit:${input.limit}`, () =>
    Ratelimit.slidingWindow(PER_CALLER_PER_MINUTE[input.limit], '1 m'),
  );
  return consume({ limiter, identifier: input.identifier, limit: input.limit });
}

// why: one counter shared by every caller. A route takes its token only once
// the input is valid, so malformed calls cannot exhaust it for everyone.
export async function applyDailyCap(input: {
  bucket: DailyCappedBucket;
}): Promise<RateLimitResult> {
  if (env().NODE_ENV === 'development') return UNLIMITED;

  const cap = dailyCap(input.bucket);
  const limiter = cachedRatelimit(`app:ratelimit:daily:${input.bucket}`, () =>
    Ratelimit.fixedWindow(cap, '1 d'),
  );
  const result = await consume({
    limiter,
    identifier: DAILY_CAP_IDENTIFIER,
    limit: input.bucket,
  });
  if (!result.success && result.reason === 'limited') {
    log.warn('rate_limit.daily_cap_reached', {
      limit: input.bucket,
      cap,
      reset: result.reset,
    });
  }
  return result;
}
