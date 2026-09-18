import { ok } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers()),
}));

vi.mock('@/infra/auth/auth', () => ({
  auth: { api: { getSession: vi.fn() } },
}));

vi.mock('@/application/organization/get-membership', () => ({
  getMembership: vi.fn(async () => ok(null)),
}));

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return { ...actual, cache: <T>(fn: T) => fn };
});

import { getMembership } from '@/application/organization/get-membership';
import { auth } from '@/infra/auth/auth';
import { getCurrentUser } from './get-current-user';

const mockedSession = vi.mocked(auth.api.getSession);
const mockedMembership = vi.mocked(getMembership);

describe('getCurrentUser', () => {
  it('returns unauthorized when no session', async () => {
    mockedSession.mockResolvedValueOnce(null as never);
    const r = await getCurrentUser();
    expect(r.isErr()).toBe(true);
    if (r.isErr()) expect(r.error.code).toBe('unauthorized');
  });

  it('returns authenticated user with null organizationId when not a member', async () => {
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
    mockedMembership.mockResolvedValueOnce(ok(null));
    const r = await getCurrentUser();
    expect(r.isOk()).toBe(true);
    if (r.isOk()) {
      expect(r.value.id).toBe('user-1');
      expect(r.value.email).toBe('a@b');
      expect(r.value.locale).toBe('fr');
      expect(r.value.organizationId).toBeNull();
      expect(r.value.sessionId).toBe('sess-1');
    }
  });

  it('returns organizationId when membership exists', async () => {
    mockedSession.mockResolvedValueOnce({
      user: {
        id: 'user-1',
        email: 'a@b',
        firstName: 'A',
        lastName: 'B',
        image: 'img',
        locale: 'en',
      },
      session: { id: 'sess-1' },
    } as never);
    mockedMembership.mockResolvedValueOnce(
      ok({ organizationId: 'org-9', role: 'owner' }),
    );
    const r = await getCurrentUser();
    expect(r.isOk()).toBe(true);
    if (r.isOk()) {
      expect(r.value.organizationId).toBe('org-9');
      expect(r.value.image).toBe('img');
      expect(r.value.locale).toBe('en');
    }
  });
});
