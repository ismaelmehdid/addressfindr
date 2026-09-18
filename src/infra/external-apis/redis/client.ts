import 'server-only';

import { Redis } from '@upstash/redis';
import { env } from '@/shared/env';

const globalForRedis = globalThis as unknown as {
  redis: Redis | null | undefined;
};

export function getRedisClient(): Redis | null {
  if (globalForRedis.redis !== undefined) return globalForRedis.redis;
  const e = env();
  if (!e.UPSTASH_REDIS_REST_URL || !e.UPSTASH_REDIS_REST_TOKEN) {
    globalForRedis.redis = null;
    return null;
  }
  const client = new Redis({
    url: e.UPSTASH_REDIS_REST_URL,
    token: e.UPSTASH_REDIS_REST_TOKEN,
  });
  globalForRedis.redis = client;
  return client;
}
