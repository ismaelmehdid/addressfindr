import { ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/env', () => ({
  env: () => ({ SUPABASE_STORAGE_BUCKET: 'files' }),
}));

vi.mock('@/application/me/get-current-user', () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock('@/infra/external-apis/supabase-storage/storage-adapter', () => ({
  supabaseStorageAdapter: {
    createSignedUploadCredentials: vi.fn(),
  },
}));

import { getCurrentUser } from '@/application/me/get-current-user';
import { supabaseStorageAdapter } from '@/infra/external-apis/supabase-storage/storage-adapter';
import { createSignedUploadUrl } from './create-signed-upload-url';

const authedUser = ok({
  id: 'user1',
  email: 'e@e.com',
  firstName: 'A',
  lastName: 'B',
  image: null,
  locale: 'en',
  sessionId: 's1',
});

describe('createSignedUploadUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue(authedUser);
  });

  it('builds owner-scoped path and delegates to adapter', async () => {
    vi.mocked(
      supabaseStorageAdapter.createSignedUploadCredentials,
    ).mockResolvedValue(
      ok({
        bucket: 'files',
        path: 'user1/attachments/01-doc.pdf' as never,
        signedUrl: 'https://signed',
        token: 'tok',
        resumableEndpoint:
          'https://abc.storage.supabase.co/storage/v1/upload/resumable',
        resumableChunkSizeBytes: 6 * 1024 * 1024,
        expiresAt: new Date('2030-01-01T02:00:00Z'),
      }),
    );

    const result = await createSignedUploadUrl({
      category: 'attachments',
      filename: 'Doc.pdf',
      mimeType: 'application/pdf',
    });
    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value.resumableEndpoint).toContain('/upload/resumable');
    expect(result.value.resumableChunkSizeBytes).toBe(6 * 1024 * 1024);
    expect(result.value.resumableHeaderName).toBe('x-signature');
    expect(result.value.expiresAt).toBe('2030-01-01T02:00:00.000Z');
    const call = vi.mocked(supabaseStorageAdapter.createSignedUploadCredentials)
      .mock.calls[0]?.[0];
    expect(call?.path.startsWith('user1/attachments/')).toBe(true);
    expect(call?.upsert).toBe(false);
  });

  it('rejects disallowed mime', async () => {
    const result = await createSignedUploadUrl({
      category: 'attachments',
      filename: 'malware.exe',
      mimeType: 'application/x-executable' as never,
    });
    expect(result.isErr()).toBe(true);
    if (!result.isErr()) return;
    expect(result.error.code).toBe('validation');
  });
});
