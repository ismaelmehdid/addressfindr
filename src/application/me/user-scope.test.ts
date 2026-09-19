import { err, ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/env', () => ({
  env: () => ({ LOG_LEVEL: 'silent' }),
}));

vi.mock('@/application/me/get-current-user', () => ({
  getCurrentUser: vi.fn(),
}));

import { getCurrentUser } from '@/application/me/get-current-user';
import { unauthorized } from '@/core/errors';
import { requireUserScope } from './user-scope';

describe('requireUserScope — authz gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the user id for a signed-in user', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(
      ok({
        id: 'user-1',
        email: 'a@b.c',
        firstName: 'A',
        lastName: 'B',
        image: null,
        locale: 'en',
        sessionId: 'sess-1',
        hasRedeemedAccess: true,
      }),
    );
    const result = await requireUserScope();
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({ userId: 'user-1' });
  });

  it('returns unauthorized when there is no session', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(err(unauthorized()));
    const result = await requireUserScope();
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe('unauthorized');
  });

  it('returns forbidden when the signed-in user has not redeemed early access', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(
      ok({
        id: 'user-1',
        email: 'a@b.c',
        firstName: 'A',
        lastName: 'B',
        image: null,
        locale: 'en',
        sessionId: 'sess-1',
        hasRedeemedAccess: false,
      }),
    );
    const result = await requireUserScope();
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe('forbidden');
  });
});
