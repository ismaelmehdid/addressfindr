import { err, ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/application/me/user-scope', () => ({
  requireUserScope: vi.fn(),
}));

vi.mock('@/application/zeroentropy/entity-sync-orchestrator', () => ({
  dispatchEvent: vi.fn(),
}));

vi.mock('@/infra/data-access/file/file-repo', () => ({
  deleteFileRow: vi.fn(),
  getFileForUser: vi.fn(),
}));

vi.mock('@/infra/external-apis/supabase-storage/storage-adapter', () => ({
  supabaseStorageAdapter: { remove: vi.fn() },
}));

vi.mock('@/shared/env', () => ({
  env: () => ({ SUPABASE_STORAGE_BUCKET: 'files' }),
}));

import { requireUserScope } from '@/application/me/user-scope';
import { dispatchEvent } from '@/application/zeroentropy/entity-sync-orchestrator';
import { notFound, unknown as unknownErr } from '@/core/errors';
import {
  deleteFileRow,
  getFileForUser,
} from '@/infra/data-access/file/file-repo';
import { supabaseStorageAdapter } from '@/infra/external-apis/supabase-storage/storage-adapter';
import { fakeFile } from './__test-helpers__';
import { deleteFile } from './delete-file';

const mockedScope = vi.mocked(requireUserScope);
const mockedGet = vi.mocked(getFileForUser);
const mockedDispatch = vi.mocked(dispatchEvent);
const mockedRemove = vi.mocked(supabaseStorageAdapter.remove);
const mockedDelete = vi.mocked(deleteFileRow);

beforeEach(() => {
  vi.clearAllMocks();
  mockedScope.mockResolvedValue(ok({ userId: 'user-1' }));
  mockedGet.mockResolvedValue(ok(fakeFile()));
  mockedDispatch.mockResolvedValue(ok(undefined));
  mockedRemove.mockResolvedValue(ok(undefined));
  mockedDelete.mockResolvedValue(ok(undefined));
});

describe('deleteFile', () => {
  it('returns scope error', async () => {
    mockedScope.mockResolvedValue(err(notFound('no scope', 'organization')));
    const r = await deleteFile('file-1');
    expect(r.isErr()).toBe(true);
  });

  it('returns repo lookup error', async () => {
    mockedGet.mockResolvedValueOnce(err(notFound('no file', 'file')));
    const r = await deleteFile('file-1');
    expect(r.isErr()).toBe(true);
    expect(mockedDispatch).not.toHaveBeenCalled();
  });

  it('aborts when ZE delete fails (does NOT delete storage)', async () => {
    mockedDispatch.mockResolvedValueOnce(err(unknownErr('ze down')));
    const r = await deleteFile('file-1');
    expect(r.isErr()).toBe(true);
    expect(mockedRemove).not.toHaveBeenCalled();
    expect(mockedDelete).not.toHaveBeenCalled();
  });

  it('aborts DB row delete when storage delete fails', async () => {
    mockedRemove.mockResolvedValueOnce(err(unknownErr('storage 500')));
    const r = await deleteFile('file-1');
    expect(r.isErr()).toBe(true);
    expect(mockedDelete).not.toHaveBeenCalled();
  });

  it('returns ok on full success', async () => {
    const r = await deleteFile('file-1');
    expect(r.isOk()).toBe(true);
    expect(mockedDispatch).toHaveBeenCalledOnce();
    expect(mockedRemove).toHaveBeenCalledOnce();
    expect(mockedDelete).toHaveBeenCalledWith({
      fileId: 'file-1',
      userId: 'user-1',
    });
  });
});
