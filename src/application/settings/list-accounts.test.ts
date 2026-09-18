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
  auth: { api: { listUserAccounts: vi.fn() } },
}));

import { getCurrentUser } from '@/application/me/get-current-user';
import { unauthorized } from '@/core/errors';
import { auth } from '@/infra/auth/auth';
import { listLinkedAccounts } from './list-accounts';

const mockedUser = vi.mocked(getCurrentUser);
const mockedList = vi.mocked(auth.api.listUserAccounts);

beforeEach(() => {
  vi.clearAllMocks();
  mockedUser.mockResolvedValue(ok({ id: 'u' } as never));
});

describe('listLinkedAccounts', () => {
  it('returns user error', async () => {
    mockedUser.mockResolvedValue(err(unauthorized('no')));
    const r = await listLinkedAccounts();
    expect(r.isErr()).toBe(true);
  });

  it('maps accounts with ISO date strings', async () => {
    mockedList.mockResolvedValueOnce([
      {
        id: 'a1',
        accountId: 'g1',
        providerId: 'google',
        createdAt: new Date('2024-01-15'),
      },
      {
        id: 'a2',
        accountId: 'gh',
        providerId: 'github',
        createdAt: '2024-02-15',
      },
    ] as never);
    const r = await listLinkedAccounts();
    expect(r.isOk()).toBe(true);
    if (r.isOk()) {
      expect(r.value).toHaveLength(2);
      expect(r.value[0]!.providerId).toBe('google');
      expect(r.value[1]!.createdAt).toBe('2024-02-15T00:00:00.000Z');
    }
  });

  it('returns unknown error on auth failure', async () => {
    mockedList.mockRejectedValueOnce(new Error('down'));
    const r = await listLinkedAccounts();
    expect(r.isErr()).toBe(true);
    if (r.isErr()) expect(r.error.code).toBe('unknown');
  });
});
