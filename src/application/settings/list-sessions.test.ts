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
  auth: { api: { listSessions: vi.fn() } },
}));

import { getCurrentUser } from '@/application/me/get-current-user';
import { unauthorized } from '@/core/errors';
import { auth } from '@/infra/auth/auth';
import { listUserSessions } from './list-sessions';

const mockedUser = vi.mocked(getCurrentUser);
const mockedList = vi.mocked(auth.api.listSessions);

beforeEach(() => {
  vi.clearAllMocks();
  mockedUser.mockResolvedValue(
    ok({ id: 'u', sessionId: 'sess-current' } as never),
  );
});

describe('listUserSessions', () => {
  it('returns user error', async () => {
    mockedUser.mockResolvedValue(err(unauthorized('no')));
    const r = await listUserSessions();
    expect(r.isErr()).toBe(true);
  });

  it('marks the current session and serialises dates', async () => {
    mockedList.mockResolvedValueOnce([
      {
        id: 'sess-current',
        token: 't1',
        createdAt: new Date('2024-01-01'),
        expiresAt: new Date('2024-01-02'),
        ipAddress: '1.2.3.4',
        userAgent: 'Mozilla',
      },
      {
        id: 'sess-other',
        token: 't2',
        createdAt: '2024-02-01',
        expiresAt: '2024-02-08',
        ipAddress: null,
        userAgent: null,
      },
    ] as never);
    const r = await listUserSessions();
    expect(r.isOk()).toBe(true);
    if (r.isOk()) {
      expect(r.value[0]!.isCurrent).toBe(true);
      expect(r.value[1]!.isCurrent).toBe(false);
      expect(r.value[1]!.createdAt).toBe('2024-02-01T00:00:00.000Z');
    }
  });

  it('returns unknown error on auth failure', async () => {
    mockedList.mockRejectedValueOnce(new Error('down'));
    const r = await listUserSessions();
    expect(r.isErr()).toBe(true);
  });
});
