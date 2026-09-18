import { err, ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/application/me/get-current-user', () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock('@/application/organization/create-organization-with-owner', () => ({
  createOrganizationWithOwner: vi.fn(),
}));

vi.mock('@/infra/auth/active-organization', () => ({
  setActiveOrganizationOnSession: vi.fn(),
}));

vi.mock('@/infra/data-access/early-access/early-access-repo', () => ({
  claimCode: vi.fn(),
}));

vi.mock('@/shared/early-access-hash', () => ({
  hashEarlyAccessCode: (s: string) => `hash-${s}`,
}));

vi.mock('@/shared/utils/id', () => ({
  newId: () => 'org-new',
}));

import { getCurrentUser } from '@/application/me/get-current-user';
import { createOrganizationWithOwner } from '@/application/organization/create-organization-with-owner';
import { unauthorized, unknown as unknownError } from '@/core/errors';
import { setActiveOrganizationOnSession } from '@/infra/auth/active-organization';
import { claimCode } from '@/infra/data-access/early-access/early-access-repo';
import { redeem } from './redeem';

const mockedUser = vi.mocked(getCurrentUser);
const mockedClaim = vi.mocked(claimCode);
const mockedCreate = vi.mocked(createOrganizationWithOwner);
const mockedActivate = vi.mocked(setActiveOrganizationOnSession);

beforeEach(() => {
  vi.clearAllMocks();
});

function mockAuthedUser(): void {
  mockedUser.mockResolvedValue(
    ok({ id: 'u', organizationId: null, sessionId: 's' } as never),
  );
}

describe('redeem', () => {
  it('returns invalid_input for too-short organization name', async () => {
    mockAuthedUser();
    const r = await redeem({ code: 'abcd', organizationName: 'x' });
    expect(r).toEqual({ success: false, error: 'invalid_input' });
  });

  it('returns invalid_input for empty code', async () => {
    mockAuthedUser();
    const r = await redeem({ code: '', organizationName: 'Acme' });
    expect(r).toEqual({ success: false, error: 'invalid_input' });
  });

  it('returns unauthenticated when no user', async () => {
    mockedUser.mockResolvedValue(err(unauthorized('no')));
    const r = await redeem({ code: 'abcd', organizationName: 'Acme' });
    expect(r).toEqual({ success: false, error: 'unauthenticated' });
  });

  it('returns already_in_org when user has organizationId', async () => {
    mockedUser.mockResolvedValue(
      ok({
        id: 'u',
        organizationId: 'existing',
        sessionId: 's',
      } as never),
    );
    const r = await redeem({ code: 'abcd', organizationName: 'Acme' });
    expect(r).toEqual({ success: false, error: 'already_in_org' });
  });

  it('returns unknown when the claim itself fails', async () => {
    mockAuthedUser();
    mockedClaim.mockResolvedValueOnce(err(unknownError('db down')));
    const r = await redeem({ code: 'abcd', organizationName: 'Acme' });
    expect(r).toEqual({ success: false, error: 'unknown' });
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it('returns invalid_code when the code cannot be claimed', async () => {
    mockAuthedUser();
    mockedClaim.mockResolvedValueOnce(ok(false));
    const r = await redeem({ code: 'used', organizationName: 'Acme' });
    expect(r).toEqual({ success: false, error: 'invalid_code' });
    expect(mockedClaim).toHaveBeenCalledWith({
      codeHash: 'hash-used',
      userId: 'u',
    });
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it('creates the organization and activates the session on success', async () => {
    mockAuthedUser();
    mockedClaim.mockResolvedValueOnce(ok(true));
    mockedCreate.mockResolvedValueOnce(ok(undefined));
    mockedActivate.mockResolvedValueOnce(ok(undefined));
    const r = await redeem({ code: 'fresh', organizationName: 'Acme Corp' });
    expect(r).toEqual({ success: true, organizationId: 'org-new' });
    expect(mockedCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-new',
        name: 'Acme Corp',
        ownerUserId: 'u',
      }),
    );
    expect(mockedActivate).toHaveBeenCalledWith({
      sessionId: 's',
      organizationId: 'org-new',
    });
  });

  it('returns unknown when organization creation fails after claim', async () => {
    mockAuthedUser();
    mockedClaim.mockResolvedValueOnce(ok(true));
    mockedCreate.mockResolvedValueOnce(err(unknownError('db down')));
    const r = await redeem({ code: 'fresh', organizationName: 'Acme Corp' });
    expect(r).toEqual({ success: false, error: 'unknown' });
  });

  it('still succeeds when session activation fails (recoverable)', async () => {
    mockAuthedUser();
    mockedClaim.mockResolvedValueOnce(ok(true));
    mockedCreate.mockResolvedValueOnce(ok(undefined));
    mockedActivate.mockResolvedValueOnce(err(unknownError('boom')));
    const r = await redeem({ code: 'fresh', organizationName: 'Acme Corp' });
    expect(r).toEqual({ success: true, organizationId: 'org-new' });
  });
});
