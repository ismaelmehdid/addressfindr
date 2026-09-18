import { err, ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/application/me/organization-scope', () => ({
  requireOrganizationScope: vi.fn(),
}));

vi.mock('@/application/storage/create-signed-upload-url', () => ({
  createSignedUploadUrl: vi.fn(),
}));

vi.mock('@/infra/data-access/file/file-repo', () => ({
  createFile: vi.fn(),
}));

import { requireOrganizationScope } from '@/application/me/organization-scope';
import { createSignedUploadUrl } from '@/application/storage/create-signed-upload-url';
import { notFound } from '@/core/errors';
import { createFile } from '@/infra/data-access/file/file-repo';
import { fakeFile } from './__test-helpers__';
import { initiateFileUpload } from './initiate-upload';

const mockedScope = vi.mocked(requireOrganizationScope);
const mockedSign = vi.mocked(createSignedUploadUrl);
const mockedCreate = vi.mocked(createFile);

beforeEach(() => {
  vi.clearAllMocks();
  mockedScope.mockResolvedValue(
    ok({ userId: 'user-1', organizationId: 'org-1' }),
  );
  mockedSign.mockResolvedValue(
    ok({
      bucket: 'files',
      path: 'attachments/2024/x.pdf',
      signedUrl: 'https://signed/up',
      token: 'tok-1',
      resumableEndpoint: 'https://r',
      resumableChunkSizeBytes: 1024,
      resumableHeaderName: 'x-upsert',
      expiresAt: '2024-03-01T00:00:00Z',
    } as never),
  );
  mockedCreate.mockResolvedValue(ok(fakeFile()));
});

describe('initiateFileUpload', () => {
  it('rejects unsupported mime', async () => {
    const r = await initiateFileUpload({
      originalName: 'evil.exe',
      mimeType: 'application/octet-stream' as never,
      sizeBytes: 100,
    });
    expect(r.isErr()).toBe(true);
    if (r.isErr()) expect(r.error.code).toBe('validation');
    expect(mockedSign).not.toHaveBeenCalled();
  });

  it('returns scope error', async () => {
    mockedScope.mockResolvedValue(err(notFound('no scope', 'organization')));
    const r = await initiateFileUpload({
      originalName: 'a.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 100,
    });
    expect(r.isErr()).toBe(true);
  });

  it('returns sign error', async () => {
    mockedSign.mockResolvedValueOnce(err(notFound('no bucket', 'storage')));
    const r = await initiateFileUpload({
      originalName: 'a.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 100,
    });
    expect(r.isErr()).toBe(true);
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it('returns DB create error', async () => {
    mockedCreate.mockResolvedValueOnce(err(notFound('db', 'file')));
    const r = await initiateFileUpload({
      originalName: 'a.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 100,
    });
    expect(r.isErr()).toBe(true);
  });

  it('returns combined DTO on success', async () => {
    const r = await initiateFileUpload({
      originalName: 'a.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 100,
    });
    expect(r.isOk()).toBe(true);
    if (r.isOk()) {
      expect(r.value.fileId).toBe('file-1');
      expect(r.value.bucket).toBe('files');
      expect(r.value.signedUrl).toBe('https://signed/up');
      expect(r.value.token).toBe('tok-1');
    }
  });
});
