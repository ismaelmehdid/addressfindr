import 'server-only';

import { Ratelimit } from '@upstash/ratelimit';
import { getRedisClient } from '@/infra/external-apis/redis/client';
import { env } from '@/shared/env';
import { log } from '@/shared/logger';

export type RateLimitResult = {
  success: boolean;
  remaining: number;
  reset: number;
};

const globalForRateLimit = globalThis as unknown as {
  defaultRatelimit: Ratelimit | null | undefined;
  uploadRatelimit: Ratelimit | null | undefined;
  transcribeRatelimit: Ratelimit | null | undefined;
  listingExtractRatelimit: Ratelimit | null | undefined;
  listingMatchRatelimit: Ratelimit | null | undefined;
};

function buildRatelimit(tokens: number, window: '1 m'): Ratelimit | null {
  const redis = getRedisClient();
  if (!redis) return null;
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(tokens, window),
    prefix: 'app:ratelimit',
    analytics: false,
  });
}

function getDefaultRatelimit(): Ratelimit | null {
  if (globalForRateLimit.defaultRatelimit !== undefined) {
    return globalForRateLimit.defaultRatelimit;
  }
  const limiter = buildRatelimit(60, '1 m');
  globalForRateLimit.defaultRatelimit = limiter;
  return limiter;
}

function getUploadRatelimit(): Ratelimit | null {
  if (globalForRateLimit.uploadRatelimit !== undefined) {
    return globalForRateLimit.uploadRatelimit;
  }
  const limiter = buildRatelimit(20, '1 m');
  globalForRateLimit.uploadRatelimit = limiter;
  return limiter;
}

function getTranscribeRatelimit(): Ratelimit | null {
  if (globalForRateLimit.transcribeRatelimit !== undefined) {
    return globalForRateLimit.transcribeRatelimit;
  }
  const limiter = buildRatelimit(30, '1 m');
  globalForRateLimit.transcribeRatelimit = limiter;
  return limiter;
}

function getListingExtractRatelimit(): Ratelimit | null {
  if (globalForRateLimit.listingExtractRatelimit !== undefined) {
    return globalForRateLimit.listingExtractRatelimit;
  }
  const limiter = buildRatelimit(10, '1 m');
  globalForRateLimit.listingExtractRatelimit = limiter;
  return limiter;
}

function getListingMatchRatelimit(): Ratelimit | null {
  if (globalForRateLimit.listingMatchRatelimit !== undefined) {
    return globalForRateLimit.listingMatchRatelimit;
  }
  const limiter = buildRatelimit(20, '1 m');
  globalForRateLimit.listingMatchRatelimit = limiter;
  return limiter;
}

export type RateLimitBucket =
  | 'default'
  | 'upload'
  | 'transcribe'
  | 'listing-extract'
  | 'listing-match';

function getLimiter(bucket: RateLimitBucket): Ratelimit | null {
  if (bucket === 'upload') return getUploadRatelimit();
  if (bucket === 'transcribe') return getTranscribeRatelimit();
  if (bucket === 'listing-extract') return getListingExtractRatelimit();
  if (bucket === 'listing-match') return getListingMatchRatelimit();
  return getDefaultRatelimit();
}

export async function applyRateLimit(input: {
  identifier: string;
  limit: RateLimitBucket;
}): Promise<RateLimitResult> {
  if (env().NODE_ENV === 'development') {
    return { success: true, remaining: Number.POSITIVE_INFINITY, reset: 0 };
  }

  const limiter = getLimiter(input.limit);
  if (!limiter) {
    log.warn('rate_limit.skipped.redis_unavailable', {
      identifier: input.identifier,
      limit: input.limit,
    });
    return { success: true, remaining: Number.POSITIVE_INFINITY, reset: 0 };
  }

  try {
    const result = await limiter.limit(input.identifier);
    return {
      success: result.success,
      remaining: result.remaining,
      reset: result.reset,
    };
  } catch (error) {
    log.error(
      'rate_limit.error',
      error instanceof Error ? error : new Error(String(error)),
      { identifier: input.identifier, limit: input.limit },
    );
    return { success: true, remaining: Number.POSITIVE_INFINITY, reset: 0 };
  }
}
