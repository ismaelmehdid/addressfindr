import { err, ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/application/me/get-current-user', () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock('@/application/rate-limit/apply-rate-limit', () => ({
  applyRateLimit: vi.fn(),
}));

import { getCurrentUser } from '@/application/me/get-current-user';
import { applyRateLimit } from '@/application/rate-limit/apply-rate-limit';
import { unauthorized } from '@/core/errors';
import { openRoute, requireAuthedRoute } from './api-route';

const mockedUser = vi.mocked(getCurrentUser);
const mockedRateLimit = vi.mocked(applyRateLimit);

beforeEach(() => {
  vi.clearAllMocks();
  mockedRateLimit.mockResolvedValue({ success: true, remaining: 1, reset: 0 });
});

describe('requireAuthedRoute — authz gate', () => {
  it('rejects a signed-out caller', async () => {
    mockedUser.mockResolvedValue(err(unauthorized('no session')));

    const result = await requireAuthedRoute({
      rateLimit: 'default',
      event: 'test.event',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(401);
  });

  it('allows a signed-in caller', async () => {
    mockedUser.mockResolvedValue(ok({ id: 'user-1' } as never));

    const result = await requireAuthedRoute({
      rateLimit: 'default',
      event: 'test.event',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ctx).toEqual({ userId: 'user-1' });
  });
});

function extractRequest(headers: Record<string, string> = {}): Request {
  return new Request('https://app.test/api/listings/extract', {
    method: 'POST',
    headers,
  });
}

describe('openRoute — anonymous access with a rate limit', () => {
  it('lets a signed-out caller through with a null user id', async () => {
    mockedUser.mockResolvedValue(err(unauthorized('no session')));

    const result = await openRoute({
      req: extractRequest({ 'x-forwarded-for': '203.0.113.7' }),
      rateLimit: 'listing-extract',
      event: 'test.event',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.caller).toEqual({ userId: null });
  });

  it('keys the limit on the client address for a signed-out caller', async () => {
    mockedUser.mockResolvedValue(err(unauthorized('no session')));

    await openRoute({
      req: extractRequest({ 'x-forwarded-for': '203.0.113.7' }),
      rateLimit: 'listing-extract',
      event: 'test.event',
    });

    expect(mockedRateLimit).toHaveBeenCalledWith({
      identifier: 'ip:203.0.113.7',
      limit: 'listing-extract',
    });
  });

  it('keys the limit on the user id for a signed-in caller', async () => {
    mockedUser.mockResolvedValue(ok({ id: 'user-1' } as never));

    const result = await openRoute({
      req: extractRequest({ 'x-forwarded-for': '203.0.113.7' }),
      rateLimit: 'listing-extract',
      event: 'test.event',
    });

    expect(mockedRateLimit).toHaveBeenCalledWith({
      identifier: 'user-1',
      limit: 'listing-extract',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.caller).toEqual({ userId: 'user-1' });
  });

  it('rejects a signed-out caller over the limit', async () => {
    mockedUser.mockResolvedValue(err(unauthorized('no session')));
    mockedRateLimit.mockResolvedValue({
      success: false,
      reason: 'limited',
      reset: 42,
    });

    const result = await openRoute({
      req: extractRequest({ 'x-forwarded-for': '203.0.113.7' }),
      rateLimit: 'listing-extract',
      event: 'test.event',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(429);
    const body = await result.response.json();
    expect(body.error).toBe('rate_limited');
  });
});

describe('openRoute — limiter unavailable', () => {
  it('answers 503 when a paid bucket fails closed', async () => {
    mockedUser.mockResolvedValue(err(unauthorized('no session')));
    mockedRateLimit.mockResolvedValue({
      success: false,
      reason: 'unavailable',
    });

    const result = await openRoute({
      req: extractRequest(),
      rateLimit: 'listing-extract',
      event: 'test.event',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(503);
    const body = await result.response.json();
    expect(body.error).toBe('service_unavailable');
  });
});
