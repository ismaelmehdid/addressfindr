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

vi.mock('./get-membership', () => ({
  getMembership: vi.fn(),
}));

vi.mock('@/infra/auth/auth', () => ({
  auth: { api: { listMembers: vi.fn() } },
}));

import { getCurrentUser } from '@/application/me/get-current-user';
import { unauthorized } from '@/core/errors';
import { auth } from '@/infra/auth/auth';
import { getMembership } from './get-membership';
import { listOrganizationMembers } from './list-members';

const mockedUser = vi.mocked(getCurrentUser);
const mockedMembership = vi.mocked(getMembership);
const mockedList = vi.mocked(auth.api.listMembers);

beforeEach(() => {
  vi.clearAllMocks();
  mockedUser.mockResolvedValue(ok({ id: 'u' } as never));
  mockedMembership.mockResolvedValue(
    ok({ organizationId: 'org-1', role: 'owner' }),
  );
});

describe('listOrganizationMembers', () => {
  it('returns user error', async () => {
    mockedUser.mockResolvedValue(err(unauthorized('no')));
    const r = await listOrganizationMembers();
    expect(r.isErr()).toBe(true);
  });

  it('returns forbidden when user has no org', async () => {
    mockedMembership.mockResolvedValue(ok(null));
    const r = await listOrganizationMembers();
    expect(r.isErr()).toBe(true);
    if (r.isErr()) expect(r.error.code).toBe('forbidden');
  });

  it('normalises unknown roles to "member"', async () => {
    mockedList.mockResolvedValueOnce({
      members: [
        {
          id: 'm1',
          userId: 'u1',
          role: 'owner',
          user: { email: 'a@b', name: 'A', image: null },
          createdAt: new Date('2024-01-01'),
        },
        {
          id: 'm2',
          userId: 'u2',
          role: 'random-string',
          user: { email: 'c@d', name: 'C' },
          createdAt: '2024-02-01',
        },
      ],
    } as never);
    const r = await listOrganizationMembers();
    expect(r.isOk()).toBe(true);
    if (r.isOk()) {
      expect(r.value[0]!.role).toBe('owner');
      expect(r.value[1]!.role).toBe('member');
      expect(r.value[1]!.createdAt).toBe('2024-02-01T00:00:00.000Z');
    }
  });

  it('returns unknown error on auth.api failure', async () => {
    mockedList.mockRejectedValueOnce(new Error('auth down'));
    const r = await listOrganizationMembers();
    expect(r.isErr()).toBe(true);
    if (r.isErr()) expect(r.error.code).toBe('unknown');
  });
});
