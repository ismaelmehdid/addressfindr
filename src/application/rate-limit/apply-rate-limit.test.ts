import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const envMock = vi.hoisted(() => ({
  NODE_ENV: 'development' as 'development' | 'production',
}));

vi.mock('@/shared/env', () => ({
  env: () => envMock,
}));

vi.mock('@/infra/external-apis/redis/client', () => ({
  getRedisClient: vi.fn(() => null),
}));

const limiters = vi.hoisted(() => ({ prefixes: [] as string[] }));

vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: class {
    static slidingWindow = () => 'sliding-window';
    constructor(options: { prefix: string }) {
      limiters.prefixes.push(options.prefix);
    }
    async limit() {
      return { success: true, remaining: 1, reset: 0 };
    }
  },
}));

import { getRedisClient } from '@/infra/external-apis/redis/client';
import { applyRateLimit } from './apply-rate-limit';

beforeEach(() => {
  vi.clearAllMocks();
  envMock.NODE_ENV = 'development';
  (globalThis as Record<string, unknown>).defaultRatelimit = undefined;
  (globalThis as Record<string, unknown>).uploadRatelimit = undefined;
  (globalThis as Record<string, unknown>).listingExtractRatelimit = undefined;
  (globalThis as Record<string, unknown>).streetViewRatelimit = undefined;
  (globalThis as Record<string, unknown>).listingFeedbackRatelimit = undefined;
  limiters.prefixes = [];
});

describe('applyRateLimit', () => {
  it('always passes in development', async () => {
    envMock.NODE_ENV = 'development';
    const r = await applyRateLimit({ identifier: 'u', limit: 'default' });
    expect(r.success).toBe(true);
    expect(r.remaining).toBe(Number.POSITIVE_INFINITY);
  });

  it('fails open when redis is not configured', async () => {
    envMock.NODE_ENV = 'production';
    vi.mocked(getRedisClient).mockReturnValue(null);
    const r = await applyRateLimit({ identifier: 'u', limit: 'upload' });
    expect(r.success).toBe(true);
  });

  // why: a shared prefix made every bucket share one Upstash counter; Street
  // View photos used up the extraction quota.
  it('keys every bucket on its own counter', async () => {
    envMock.NODE_ENV = 'production';
    vi.mocked(getRedisClient).mockReturnValue(
      {} as ReturnType<typeof getRedisClient>,
    );

    await applyRateLimit({ identifier: 'u', limit: 'listing-extract' });
    await applyRateLimit({ identifier: 'u', limit: 'street-view' });

    expect(limiters.prefixes).toEqual([
      'app:ratelimit:listing-extract',
      'app:ratelimit:street-view',
    ]);
  });

  it('keys listing feedback on its own counter', async () => {
    envMock.NODE_ENV = 'production';
    vi.mocked(getRedisClient).mockReturnValue(
      {} as ReturnType<typeof getRedisClient>,
    );

    const r = await applyRateLimit({
      identifier: 'ip:203.0.113.7',
      limit: 'listing-feedback',
    });

    expect(r.success).toBe(true);
    expect(limiters.prefixes).toEqual(['app:ratelimit:listing-feedback']);
  });
});
