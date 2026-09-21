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
import { requireAuthedRoute } from './api-route';

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
