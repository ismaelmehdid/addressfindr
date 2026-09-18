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
import { requireOrganizationScope } from './organization-scope';

describe('requireOrganizationScope — authz gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('propagates auth error when user is not signed in', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(err(unauthorized()));
    const result = await requireOrganizationScope();
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('unauthorized');
  });

  it('returns forbidden when organizationId is missing', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(
      ok({ id: 'user-1', email: 'a@b.c', organizationId: null } as never),
    );
    const result = await requireOrganizationScope();
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('forbidden');
  });

  it('returns scope when user has an organization', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(
      ok({ id: 'user-1', email: 'a@b.c', organizationId: 'org-1' } as never),
    );
    const result = await requireOrganizationScope();
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({
        userId: 'user-1',
        organizationId: 'org-1',
      });
    }
  });
});
