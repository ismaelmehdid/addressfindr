import { describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers()),
}));

vi.mock('@/infra/auth/auth', () => ({
  auth: { api: { getSession: vi.fn() } },
}));

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return { ...actual, cache: <T>(fn: T) => fn };
});

import { auth } from '@/infra/auth/auth';
import { getCurrentUser } from './get-current-user';

const mockedSession = vi.mocked(auth.api.getSession);

describe('getCurrentUser', () => {
  it('returns unauthorized when no session', async () => {
    mockedSession.mockResolvedValueOnce(null as never);
    const r = await getCurrentUser();
    expect(r.isErr()).toBe(true);
    if (r.isErr()) expect(r.error.code).toBe('unauthorized');
  });

  it('maps the session onto the authenticated user', async () => {
    mockedSession.mockResolvedValueOnce({
      user: {
        id: 'user-1',
        email: 'a@b',
        firstName: 'A',
        lastName: 'B',
        image: null,
        locale: 'fr',
      },
      session: { id: 'sess-1' },
    } as never);
    const r = await getCurrentUser();
    expect(r.isOk()).toBe(true);
    if (r.isOk()) {
      expect(r.value.id).toBe('user-1');
      expect(r.value.email).toBe('a@b');
      expect(r.value.locale).toBe('fr');
      expect(r.value.sessionId).toBe('sess-1');
    }
  });

  it('falls back to fr when the session carries no locale', async () => {
    mockedSession.mockResolvedValueOnce({
      user: {
        id: 'user-1',
        email: 'a@b',
        firstName: 'A',
        lastName: 'B',
        image: 'img',
        locale: null,
      },
      session: { id: 'sess-1' },
    } as never);
    const r = await getCurrentUser();
    expect(r.isOk()).toBe(true);
    if (r.isOk()) {
      expect(r.value.image).toBe('img');
      expect(r.value.locale).toBe('fr');
    }
  });
});
