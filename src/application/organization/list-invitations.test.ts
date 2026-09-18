import { err, ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers()),
}));

vi.mock('@/application/me/get-current-user', () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock('@/infra/auth/auth', () => ({
  auth: { api: { listInvitations: vi.fn() } },
}));

import { getCurrentUser } from '@/application/me/get-current-user';
import { unauthorized } from '@/core/errors';
import { auth } from '@/infra/auth/auth';
import { listOrganizationInvitations } from './list-invitations';

const mockedUser = vi.mocked(getCurrentUser);
const mockedList = vi.mocked(auth.api.listInvitations);

beforeEach(() => {
  vi.clearAllMocks();
  mockedUser.mockResolvedValue(
    ok({ id: 'u', organizationId: 'org-1' } as never),
  );
});

describe('listOrganizationInvitations', () => {
  it('returns user error', async () => {
    mockedUser.mockResolvedValue(err(unauthorized('no')));
    const r = await listOrganizationInvitations();
    expect(r.isErr()).toBe(true);
  });

  it('returns forbidden when no org', async () => {
    mockedUser.mockResolvedValue(
      ok({ id: 'u', organizationId: null } as never),
    );
    const r = await listOrganizationInvitations();
    expect(r.isErr()).toBe(true);
    if (r.isErr()) expect(r.error.code).toBe('forbidden');
  });

  it('filters out non-pending invitations', async () => {
    mockedList.mockResolvedValueOnce([
      {
        id: '1',
        email: 'a@b',
        role: 'admin',
        status: 'pending',
        expiresAt: new Date('2024-12-01'),
        inviterId: 'inv',
      },
      {
        id: '2',
        email: 'c@d',
        role: 'member',
        status: 'accepted',
        expiresAt: new Date('2024-12-01'),
        inviterId: 'inv',
      },
    ] as never);
    const r = await listOrganizationInvitations();
    expect(r.isOk()).toBe(true);
    if (r.isOk()) {
      expect(r.value).toHaveLength(1);
      expect(r.value[0]!.id).toBe('1');
      expect(r.value[0]!.role).toBe('admin');
    }
  });

  it('defaults missing role to "member"', async () => {
    mockedList.mockResolvedValueOnce([
      {
        id: '1',
        email: 'a@b',
        status: 'pending',
        expiresAt: new Date('2024-12-01'),
        inviterId: 'inv',
      },
    ] as never);
    const r = await listOrganizationInvitations();
    if (r.isOk()) expect(r.value[0]!.role).toBe('member');
  });

  it('returns unknown error on auth failure', async () => {
    mockedList.mockRejectedValueOnce(new Error('down'));
    const r = await listOrganizationInvitations();
    expect(r.isErr()).toBe(true);
    if (r.isErr()) expect(r.error.code).toBe('unknown');
  });
});
