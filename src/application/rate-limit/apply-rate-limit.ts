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

function dailyCap(bucket: RateLimitBucket): number | null {
  const e = env();
  if (bucket === 'listing-extract') return e.RATE_LIMIT_DAILY_LISTING_EXTRACT;
  if (bucket === 'listing-match') return e.RATE_LIMIT_DAILY_LISTING_MATCH;
  if (bucket === 'street-view') return e.RATE_LIMIT_DAILY_STREET_VIEW;
  return null;
}

type BucketLimiters = {
  perCaller: Ratelimit;
  daily: { limiter: Ratelimit; cap: number } | null;
};

const globalForRateLimit = globalThis as unknown as {
  rateLimiters: Map<RateLimitBucket, BucketLimiters | null> | undefined;
};

// why: Upstash keys a counter on prefix + identifier + window. With a shared
// prefix every bucket incremented the same counter: one search's photos
// exhausted the next search's extraction quota.
function buildBucketLimiters(bucket: RateLimitBucket): BucketLimiters | null {
  const redis = getRedisClient();
  if (!redis) return null;
  const cap = dailyCap(bucket);
  return {
    perCaller: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(PER_CALLER_PER_MINUTE[bucket], '1 m'),
      prefix: `app:ratelimit:${bucket}`,
      analytics: false,
    }),
    daily:
      cap === null
        ? null
        : {
            cap,
            limiter: new Ratelimit({
              redis,
              limiter: Ratelimit.fixedWindow(cap, '1 d'),
              prefix: `app:ratelimit:daily:${bucket}`,
              analytics: false,
            }),
          },
  };
}

function bucketLimiters(bucket: RateLimitBucket): BucketLimiters | null {
  globalForRateLimit.rateLimiters ??= new Map();
  const cache = globalForRateLimit.rateLimiters;
  if (cache.has(bucket)) return cache.get(bucket) ?? null;
  const built = buildBucketLimiters(bucket);
  cache.set(bucket, built);
  return built;
}

async function limitOrThrow(
  limiter: Ratelimit,
  identifier: string,
): Promise<{ success: boolean; remaining: number; reset: number }> {
  const result = await limiter.limit(identifier);
  // why: Upstash resolves a Redis timeout as a success. It is an outage.
  if (result.reason === 'timeout') throw new Error('Rate limit timed out');
  return result;
}

async function limitCallerThenDay(input: {
  limiters: BucketLimiters;
  identifier: string;
  bucket: RateLimitBucket;
}): Promise<RateLimitResult> {
  const caller = await limitOrThrow(input.limiters.perCaller, input.identifier);
  if (!caller.success) {
    return { success: false, reason: 'limited', reset: caller.reset };
  }

  const { daily } = input.limiters;
  if (daily === null) {
    return { success: true, remaining: caller.remaining, reset: caller.reset };
  }

  const day = await limitOrThrow(daily.limiter, DAILY_CAP_IDENTIFIER);
  if (!day.success) {
    log.warn('rate_limit.daily_cap_reached', {
      limit: input.bucket,
      cap: daily.cap,
      reset: day.reset,
    });
    return { success: false, reason: 'limited', reset: day.reset };
  }
  return {
    success: true,
    remaining: Math.min(caller.remaining, day.remaining),
    reset: caller.reset,
  };
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

export async function applyRateLimit(input: {
  identifier: string;
  limit: RateLimitBucket;
}): Promise<RateLimitResult> {
  if (env().NODE_ENV === 'development') return UNLIMITED;

  const limiters = bucketLimiters(input.limit);
  if (!limiters) return whenRedisUnavailable(input);

  try {
    return await limitCallerThenDay({
      limiters,
      identifier: input.identifier,
      bucket: input.limit,
    });
  } catch (error) {
    log.error(
      'rate_limit.error',
      error instanceof Error ? error : new Error(String(error)),
      { identifier: input.identifier, limit: input.limit },
    );
    return whenRedisUnavailable(input);
  }
}
