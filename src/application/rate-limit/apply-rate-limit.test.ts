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

import { getRedisClient } from '@/infra/external-apis/redis/client';
import { applyRateLimit } from './apply-rate-limit';

beforeEach(() => {
  vi.clearAllMocks();
  envMock.NODE_ENV = 'development';
  (globalThis as Record<string, unknown>).defaultRatelimit = undefined;
  (globalThis as Record<string, unknown>).uploadRatelimit = undefined;
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
});
