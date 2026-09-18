import { err, ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/application/me/organization-scope', () => ({
  requireOrganizationScope: vi.fn(),
}));

vi.mock('@/infra/data-access/file/file-repo', () => ({
  getFileForOrg: vi.fn(),
}));

vi.mock('@/infra/external-apis/supabase-storage/storage-adapter', () => ({
  supabaseStorageAdapter: { createSignedDownloadUrl: vi.fn() },
}));

vi.mock('@/shared/env', () => ({
  env: () => ({ SUPABASE_STORAGE_BUCKET: 'files' }),
}));

import { requireOrganizationScope } from '@/application/me/organization-scope';
import { notFound, unknown as unknownErr } from '@/core/errors';
import { getFileForOrg } from '@/infra/data-access/file/file-repo';
import { supabaseStorageAdapter } from '@/infra/external-apis/supabase-storage/storage-adapter';
import { fakeFile } from './__test-helpers__';
import { getFileDownloadUrl } from './get-download-url';

const mockedScope = vi.mocked(requireOrganizationScope);
const mockedGet = vi.mocked(getFileForOrg);
const mockedSign = vi.mocked(supabaseStorageAdapter.createSignedDownloadUrl);

beforeEach(() => {
  vi.clearAllMocks();
  mockedScope.mockResolvedValue(
    ok({ userId: 'user-1', organizationId: 'org-1' }),
  );
  mockedGet.mockResolvedValue(ok(fakeFile()));
});

describe('getFileDownloadUrl', () => {
  it('returns scope error', async () => {
    mockedScope.mockResolvedValue(err(notFound('no scope', 'organization')));
    const r = await getFileDownloadUrl('file-1');
    expect(r.isErr()).toBe(true);
  });

  it('returns repo error', async () => {
    mockedGet.mockResolvedValueOnce(err(notFound('no file', 'file')));
    const r = await getFileDownloadUrl('file-1');
    expect(r.isErr()).toBe(true);
    expect(mockedSign).not.toHaveBeenCalled();
  });

  it('returns storage error', async () => {
    mockedSign.mockResolvedValueOnce(err(unknownErr('s3 down')));
    const r = await getFileDownloadUrl('file-1');
    expect(r.isErr()).toBe(true);
  });

  it('returns URL with ISO expiry on success', async () => {
    mockedSign.mockResolvedValueOnce(
      ok({
        url: 'https://signed/url',
        expiresAt: new Date('2024-03-01T00:00:00Z'),
      } as never),
    );
    const r = await getFileDownloadUrl('file-1');
    expect(r.isOk()).toBe(true);
    if (r.isOk()) {
      expect(r.value.url).toBe('https://signed/url');
      expect(r.value.expiresAt).toBe('2024-03-01T00:00:00.000Z');
    }
  });

  it('signs the file storage key as the path', async () => {
    mockedSign.mockResolvedValueOnce(
      ok({
        url: 'u',
        expiresAt: new Date('2024-03-01T00:00:00Z'),
      } as never),
    );
    await getFileDownloadUrl('file-1');
    expect(mockedSign).toHaveBeenCalledWith({
      bucket: 'files',
      path: 'attachments/2024/file-1.pdf',
      ttlSeconds: 600,
      downloadAs: 'doc.pdf',
    });
  });
});
