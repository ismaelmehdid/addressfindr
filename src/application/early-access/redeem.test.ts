import { err, ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/application/me/get-current-user', () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock('@/infra/data-access/early-access/early-access-repo', () => ({
  claimCode: vi.fn(),
}));

vi.mock('@/shared/early-access-hash', () => ({
  hashEarlyAccessCode: (s: string) => `hash-${s}`,
}));

import { getCurrentUser } from '@/application/me/get-current-user';
import { unauthorized, unknown as unknownError } from '@/core/errors';
import { claimCode } from '@/infra/data-access/early-access/early-access-repo';
import { redeem } from './redeem';

const mockedUser = vi.mocked(getCurrentUser);
const mockedClaim = vi.mocked(claimCode);

beforeEach(() => {
  vi.clearAllMocks();
});

function mockAuthedUser(): void {
  mockedUser.mockResolvedValue(ok({ id: 'u', sessionId: 's' } as never));
}

describe('redeem', () => {
  it('returns invalid_input for empty code', async () => {
    mockAuthedUser();
    const r = await redeem({ code: '' });
    expect(r).toEqual({ success: false, error: 'invalid_input' });
  });

  it('returns unauthenticated when no user', async () => {
    mockedUser.mockResolvedValue(err(unauthorized('no')));
    const r = await redeem({ code: 'abcd' });
    expect(r).toEqual({ success: false, error: 'unauthenticated' });
  });

  it('returns unknown when the claim itself fails', async () => {
    mockAuthedUser();
    mockedClaim.mockResolvedValueOnce(err(unknownError('db down')));
    const r = await redeem({ code: 'abcd' });
    expect(r).toEqual({ success: false, error: 'unknown' });
  });

  it('returns invalid_code when the code cannot be claimed', async () => {
    mockAuthedUser();
    mockedClaim.mockResolvedValueOnce(ok(false));
    const r = await redeem({ code: 'used' });
    expect(r).toEqual({ success: false, error: 'invalid_code' });
    expect(mockedClaim).toHaveBeenCalledWith({
      codeHash: 'hash-used',
      userId: 'u',
    });
  });

  it('returns success when the code is claimed', async () => {
    mockAuthedUser();
    mockedClaim.mockResolvedValueOnce(ok(true));
    const r = await redeem({ code: 'fresh' });
    expect(r).toEqual({ success: true });
  });
});
