import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const envMock = vi.hoisted(() => ({
  NODE_ENV: 'development' as 'development' | 'test' | 'production',
  VERCEL_ENV: 'development' as 'development' | 'preview' | 'production',
  RATE_LIMIT_DAILY_LISTING_EXTRACT: 100,
  RATE_LIMIT_DAILY_LISTING_MATCH: 500,
  RATE_LIMIT_DAILY_STREET_VIEW: 1000,
}));

vi.mock('@/shared/env', () => ({
  env: () => envMock,
}));

vi.mock('@/infra/external-apis/redis/client', () => ({
  getRedisClient: vi.fn(() => null),
}));

type FakeWindow = { kind: 'sliding' | 'fixed'; tokens: number; window: string };

const upstash = vi.hoisted(() => ({
  limiters: [] as { prefix: string; limiter: FakeWindow }[],
  counts: new Map<string, number>(),
  failure: null as Error | null,
  timesOut: false,
}));

vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: class {
    static slidingWindow = (tokens: number, window: string): FakeWindow => ({
      kind: 'sliding',
      tokens,
      window,
    });
    static fixedWindow = (tokens: number, window: string): FakeWindow => ({
      kind: 'fixed',
      tokens,
      window,
    });
    readonly prefix: string;
    readonly tokens: number;
    constructor(options: { prefix: string; limiter: FakeWindow }) {
      upstash.limiters.push({
        prefix: options.prefix,
        limiter: options.limiter,
      });
      this.prefix = options.prefix;
      this.tokens = options.limiter.tokens;
    }
    async limit(identifier: string) {
      if (upstash.failure) throw upstash.failure;
      if (upstash.timesOut) {
        return { success: true, remaining: 0, reset: 0, reason: 'timeout' };
      }
      const key = `${this.prefix}:${identifier}`;
      const used = (upstash.counts.get(key) ?? 0) + 1;
      upstash.counts.set(key, used);
      return {
        success: used <= this.tokens,
        remaining: Math.max(0, this.tokens - used),
        reset: 1000,
      };
    }
  },
}));

import { getRedisClient } from '@/infra/external-apis/redis/client';
import {
  applyDailyCap,
  applyRateLimit,
  type DailyCappedBucket,
  type RateLimitBucket,
} from './apply-rate-limit';

const PAID_BUCKETS: RateLimitBucket[] = [
  'listing-extract',
  'listing-match',
  'street-view',
  'transcribe',
];
const FREE_BUCKETS: RateLimitBucket[] = [
  'default',
  'upload',
  'listing-feedback',
];
const DAILY_CAPPED_BUCKETS: DailyCappedBucket[] = [
  'listing-extract',
  'listing-match',
  'street-view',
];

function withRedis(): void {
  vi.mocked(getRedisClient).mockReturnValue(
    {} as ReturnType<typeof getRedisClient>,
  );
}

function withoutRedis(): void {
  vi.mocked(getRedisClient).mockReturnValue(null);
}

function inProduction(): void {
  envMock.NODE_ENV = 'production';
  envMock.VERCEL_ENV = 'production';
}

beforeEach(() => {
  vi.clearAllMocks();
  envMock.NODE_ENV = 'development';
  envMock.VERCEL_ENV = 'development';
  envMock.RATE_LIMIT_DAILY_LISTING_EXTRACT = 100;
  envMock.RATE_LIMIT_DAILY_LISTING_MATCH = 500;
  envMock.RATE_LIMIT_DAILY_STREET_VIEW = 1000;
  (globalThis as Record<string, unknown>).rateLimiters = undefined;
  upstash.limiters = [];
  upstash.counts = new Map();
  upstash.failure = null;
  upstash.timesOut = false;
});

describe('applyRateLimit', () => {
  it('always passes in development', async () => {
    envMock.NODE_ENV = 'development';
    const r = await applyRateLimit({ identifier: 'u', limit: 'default' });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.remaining).toBe(Number.POSITIVE_INFINITY);
  });

  it('fails open for a free bucket when redis is not configured', async () => {
    inProduction();
    withoutRedis();
    const r = await applyRateLimit({ identifier: 'u', limit: 'upload' });
    expect(r.success).toBe(true);
  });

  // why: a shared prefix made every bucket share one Upstash counter; Street
  // View photos used up the extraction quota.
  it('keys every bucket on its own counter', async () => {
    inProduction();
    withRedis();

    await applyRateLimit({ identifier: 'u', limit: 'listing-extract' });
    await applyRateLimit({ identifier: 'u', limit: 'street-view' });

    expect(upstash.limiters.map((l) => l.prefix)).toEqual([
      'app:ratelimit:listing-extract',
      'app:ratelimit:street-view',
    ]);
  });

  it('keys listing feedback on its own counter', async () => {
    inProduction();
    withRedis();

    const r = await applyRateLimit({
      identifier: 'ip:203.0.113.7',
      limit: 'listing-feedback',
    });

    expect(r.success).toBe(true);
    expect(upstash.limiters.map((l) => l.prefix)).toEqual([
      'app:ratelimit:listing-feedback',
    ]);
  });

  it('refuses a caller over its limit', async () => {
    inProduction();
    withRedis();

    for (let i = 0; i < 10; i += 1) {
      await applyRateLimit({ identifier: 'ip:1', limit: 'listing-extract' });
    }
    const over = await applyRateLimit({
      identifier: 'ip:1',
      limit: 'listing-extract',
    });

    expect(over).toEqual({ success: false, reason: 'limited', reset: 1000 });
  });

  // why: the daily token is taken by the route only once its input is valid,
  // so the per-caller limit must never spend it.
  it('never spends the daily cap', async () => {
    inProduction();
    withRedis();

    for (let i = 0; i < 12; i += 1) {
      await applyRateLimit({ identifier: 'ip:1', limit: 'listing-extract' });
    }

    expect(
      upstash.limiters.some((l) => l.prefix.startsWith('app:ratelimit:daily')),
    ).toBe(false);
  });
});

describe('applyDailyCap', () => {
  it('always passes in development', async () => {
    envMock.NODE_ENV = 'development';
    withRedis();

    const r = await applyDailyCap({ bucket: 'listing-extract' });

    expect(r.success).toBe(true);
    expect(upstash.limiters).toEqual([]);
  });

  it('counts every caller on one fixed window of a day', async () => {
    inProduction();
    withRedis();

    await applyDailyCap({ bucket: 'listing-match' });

    expect(upstash.limiters).toEqual([
      {
        prefix: 'app:ratelimit:daily:listing-match',
        limiter: { kind: 'fixed', tokens: 500, window: '1 d' },
      },
    ]);
    expect(upstash.counts.get('app:ratelimit:daily:listing-match:global')).toBe(
      1,
    );
  });

  it('refuses every call once the cap is spent', async () => {
    inProduction();
    withRedis();
    envMock.RATE_LIMIT_DAILY_LISTING_EXTRACT = 3;

    const results = [];
    for (let i = 0; i < 3; i += 1) {
      results.push(await applyDailyCap({ bucket: 'listing-extract' }));
    }
    const overCap = await applyDailyCap({ bucket: 'listing-extract' });

    expect(results.every((r) => r.success)).toBe(true);
    expect(overCap).toEqual({ success: false, reason: 'limited', reset: 1000 });
  });

  it('keeps one counter per bucket', async () => {
    inProduction();
    withRedis();
    envMock.RATE_LIMIT_DAILY_STREET_VIEW = 1;

    await applyDailyCap({ bucket: 'street-view' });
    const other = await applyDailyCap({ bucket: 'listing-extract' });

    expect(other.success).toBe(true);
  });
});

describe('paid buckets fail closed in production', () => {
  it.each(
    PAID_BUCKETS,
  )('refuses %s when redis is not configured', async (bucket) => {
    inProduction();
    withoutRedis();

    const r = await applyRateLimit({ identifier: 'u', limit: bucket });

    expect(r).toEqual({ success: false, reason: 'unavailable' });
  });

  it.each(
    DAILY_CAPPED_BUCKETS,
  )('refuses the daily cap of %s when redis is not configured', async (bucket) => {
    inProduction();
    withoutRedis();

    const r = await applyDailyCap({ bucket });

    expect(r).toEqual({ success: false, reason: 'unavailable' });
  });

  it.each(
    FREE_BUCKETS,
  )('lets %s through when redis is not configured', async (bucket) => {
    inProduction();
    withoutRedis();

    const r = await applyRateLimit({ identifier: 'u', limit: bucket });

    expect(r.success).toBe(true);
  });

  it('refuses a paid bucket and passes a free one when redis throws', async () => {
    inProduction();
    withRedis();
    upstash.failure = new Error('ECONNRESET');

    const paid = await applyRateLimit({
      identifier: 'u',
      limit: 'street-view',
    });
    const free = await applyRateLimit({
      identifier: 'u',
      limit: 'listing-feedback',
    });
    const daily = await applyDailyCap({ bucket: 'street-view' });

    expect(paid).toEqual({ success: false, reason: 'unavailable' });
    expect(free.success).toBe(true);
    expect(daily).toEqual({ success: false, reason: 'unavailable' });
  });

  // why: Upstash resolves success with reason 'timeout' when redis does not
  // answer in time, so a timeout is an outage, not a pass.
  it('refuses a paid bucket and passes a free one when redis times out', async () => {
    inProduction();
    withRedis();
    upstash.timesOut = true;

    const paid = await applyRateLimit({
      identifier: 'u',
      limit: 'listing-extract',
    });
    const free = await applyRateLimit({ identifier: 'u', limit: 'default' });
    const daily = await applyDailyCap({ bucket: 'listing-extract' });

    expect(paid).toEqual({ success: false, reason: 'unavailable' });
    expect(free.success).toBe(true);
    expect(daily).toEqual({ success: false, reason: 'unavailable' });
  });

  it('keeps failing open outside production', async () => {
    envMock.NODE_ENV = 'production';
    envMock.VERCEL_ENV = 'preview';
    withoutRedis();

    const perCaller = await applyRateLimit({
      identifier: 'u',
      limit: 'listing-extract',
    });
    const daily = await applyDailyCap({ bucket: 'listing-extract' });

    expect(perCaller.success).toBe(true);
    expect(daily.success).toBe(true);
  });
});
