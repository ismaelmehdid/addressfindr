import { err, ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/application/me/organization-scope', () => ({
  requireOrganizationScope: vi.fn(),
}));

vi.mock('@/infra/data-access/file/file-repo', () => ({
  listFilesForOrg: vi.fn(),
}));

import { requireOrganizationScope } from '@/application/me/organization-scope';
import { notFound } from '@/core/errors';
import { listFilesForOrg } from '@/infra/data-access/file/file-repo';
import { fakeFile } from './__test-helpers__';
import { listFiles } from './list-files';

const mockedScope = vi.mocked(requireOrganizationScope);
const mockedList = vi.mocked(listFilesForOrg);

beforeEach(() => {
  vi.clearAllMocks();
  mockedScope.mockResolvedValue(
    ok({ userId: 'user-1', organizationId: 'org-1' }),
  );
  mockedList.mockResolvedValue(
    ok({
      items: [fakeFile({ id: 'a' }), fakeFile({ id: 'b' })],
      hasMore: false,
      page: 1,
    }),
  );
});

describe('listFiles', () => {
  it('rejects negative page', async () => {
    const r = await listFiles({ page: -1 });
    expect(r.isErr()).toBe(true);
  });

  it('returns scope error', async () => {
    mockedScope.mockResolvedValue(err(notFound('no scope', 'organization')));
    const r = await listFiles({ page: 1 });
    expect(r.isErr()).toBe(true);
  });

  it('returns mapped page DTOs', async () => {
    const r = await listFiles({ page: 1 });
    expect(r.isOk()).toBe(true);
    if (r.isOk()) {
      expect(r.value.items.map((f) => f.id)).toEqual(['a', 'b']);
      expect(r.value.hasMore).toBe(false);
    }
  });

  it('forwards page/perPage to repo', async () => {
    await listFiles({ page: 2, perPage: 50 });
    expect(mockedList).toHaveBeenCalledWith({
      organizationId: 'org-1',
      page: 2,
      perPage: 50,
    });
  });
});
