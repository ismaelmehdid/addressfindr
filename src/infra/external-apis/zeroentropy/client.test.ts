import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ apiKey: undefined as string | undefined }));

vi.mock('@/shared/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/shared/env', () => ({
  env: () => ({
    ZEROENTROPY_API_URL: 'https://zeroentropy.test/v1',
    ZEROENTROPY_API_KEY: mocks.apiKey,
  }),
}));

vi.mock('./circuit-breaker', () => ({
  zeroEntropyCircuitBreaker: {
    isOpen: vi.fn(async () => false),
    recordSuccess: vi.fn(async () => {}),
    recordFailure: vi.fn(async () => {}),
    getState: vi.fn(),
    reset: vi.fn(),
  },
}));

import { zeroEntropyCircuitBreaker } from './circuit-breaker';
import { zeroEntropyClient } from './client';

describe('zeroEntropyClient when ZEROENTROPY_API_KEY is unset', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    mocks.apiKey = undefined;
  });

  it('fails with not_configured instead of issuing an unauthenticated request', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const result = await zeroEntropyClient.createCollection('collection');

    expect(result.isErr()).toBe(true);
    const error = result._unsafeUnwrapErr();
    expect(error.code).toBe('external_api');
    expect(error.message).toContain('not_configured');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does not trip the circuit breaker that guards real outages', async () => {
    await zeroEntropyClient.createCollection('collection');

    expect(zeroEntropyCircuitBreaker.recordFailure).not.toHaveBeenCalled();
  });

  it('issues the request once the key is configured', async () => {
    mocks.apiKey = 'ze-test-key';
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ message: 'ok' }), { status: 200 }),
      );

    const result = await zeroEntropyClient.createCollection('collection');

    expect(result.isOk()).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const init = fetchSpy.mock.calls[0]?.[1];
    expect(
      (init?.headers as Record<string, string> | undefined)?.Authorization,
    ).toBe('Bearer ze-test-key');
  });
});
