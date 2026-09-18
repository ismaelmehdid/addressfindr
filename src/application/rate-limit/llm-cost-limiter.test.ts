import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const envMock = vi.hoisted(() => ({
  NODE_ENV: 'production' as 'production' | 'development',
  LLM_DAILY_BUDGET_USD_PER_USER: 1,
}));

vi.mock('@/shared/env', () => ({
  env: () => envMock,
}));

const redisMock = vi.hoisted(() => ({
  get: vi.fn(),
  incrby: vi.fn(),
  expire: vi.fn(),
}));

vi.mock('@/infra/external-apis/redis/client', () => ({
  getRedisClient: vi.fn(() => redisMock),
}));

import { checkLlmBudget, recordLlmCost } from './llm-cost-limiter';

beforeEach(() => {
  vi.clearAllMocks();
  envMock.NODE_ENV = 'production';
  envMock.LLM_DAILY_BUDGET_USD_PER_USER = 1;
  redisMock.get.mockReset();
  redisMock.incrby.mockReset();
  redisMock.expire.mockReset();
});

describe('checkLlmBudget', () => {
  it('passes through in development', async () => {
    envMock.NODE_ENV = 'development';
    const r = await checkLlmBudget({ userId: 'u' });
    expect(r.isOk()).toBe(true);
    if (r.isOk()) {
      expect(r.value.allowed).toBe(true);
      expect(r.value.usedUsd).toBe(0);
    }
  });

  it('allows when under budget', async () => {
    redisMock.get.mockResolvedValueOnce(0);
    const r = await checkLlmBudget({ userId: 'u' });
    expect(r.isOk()).toBe(true);
    if (r.isOk()) {
      expect(r.value.allowed).toBe(true);
      expect(r.value.softWarning).toBe(false);
    }
  });

  it('flags soft warning past 80%', async () => {
    // 0.85 USD = 850000 microCents
    redisMock.get.mockResolvedValueOnce(850000);
    const r = await checkLlmBudget({ userId: 'u' });
    expect(r.isOk()).toBe(true);
    if (r.isOk()) {
      expect(r.value.allowed).toBe(true);
      expect(r.value.softWarning).toBe(true);
    }
  });

  it('returns rate_limited error past budget', async () => {
    redisMock.get.mockResolvedValueOnce(2_000_000);
    const r = await checkLlmBudget({ userId: 'u' });
    expect(r.isErr()).toBe(true);
    if (r.isErr()) expect(r.error.code).toBe('rate_limited');
  });

  it('parses string-encoded micro-cents', async () => {
    redisMock.get.mockResolvedValueOnce('100000');
    const r = await checkLlmBudget({ userId: 'u' });
    expect(r.isOk()).toBe(true);
    if (r.isOk()) expect(r.value.usedUsd).toBeCloseTo(0.1, 6);
  });

  it('fails open on redis error', async () => {
    redisMock.get.mockRejectedValueOnce(new Error('redis down'));
    const r = await checkLlmBudget({ userId: 'u' });
    expect(r.isOk()).toBe(true);
    if (r.isOk()) expect(r.value.allowed).toBe(true);
  });
});

describe('recordLlmCost', () => {
  it('no-ops in development', async () => {
    envMock.NODE_ENV = 'development';
    await recordLlmCost({
      userId: 'u',
      model: 'gpt-5.4-nano',
      inputTokens: 1000,
      outputTokens: 1000,
    });
    expect(redisMock.incrby).not.toHaveBeenCalled();
  });

  it('incrby and expire on first record of day (newTotal === increment)', async () => {
    // gpt-5.4-nano: 1000 in + 1000 out = $0.00145 = 1450 microCents
    redisMock.incrby.mockResolvedValueOnce(1450);
    await recordLlmCost({
      userId: 'u',
      model: 'gpt-5.4-nano',
      inputTokens: 1000,
      outputTokens: 1000,
    });
    expect(redisMock.incrby).toHaveBeenCalledOnce();
    expect(redisMock.expire).toHaveBeenCalledOnce();
  });

  it('skips expire on subsequent records (newTotal > increment)', async () => {
    redisMock.incrby.mockResolvedValueOnce(5000);
    await recordLlmCost({
      userId: 'u',
      model: 'gpt-5.4-nano',
      inputTokens: 1000,
      outputTokens: 1000,
    });
    expect(redisMock.expire).not.toHaveBeenCalled();
  });

  it('skips entirely when cost is zero', async () => {
    await recordLlmCost({
      userId: 'u',
      model: 'gpt-5.4-nano',
      inputTokens: 0,
      outputTokens: 0,
    });
    expect(redisMock.incrby).not.toHaveBeenCalled();
  });

  it('swallows redis errors silently', async () => {
    redisMock.incrby.mockRejectedValueOnce(new Error('boom'));
    await expect(
      recordLlmCost({
        userId: 'u',
        model: 'gpt-5.4-nano',
        inputTokens: 1000,
        outputTokens: 1000,
      }),
    ).resolves.toBeUndefined();
  });
});
