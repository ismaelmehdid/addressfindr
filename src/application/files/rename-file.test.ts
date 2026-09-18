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
  renameFileForUser: vi.fn(),
}));

import { requireUserScope } from '@/application/me/user-scope';
import { dispatchEvent } from '@/application/zeroentropy/entity-sync-orchestrator';
import { notFound, unknown as unknownErr } from '@/core/errors';
import { renameFileForUser } from '@/infra/data-access/file/file-repo';
import { fakeFile } from './__test-helpers__';
import { renameFile } from './rename-file';

const mockedScope = vi.mocked(requireUserScope);
const mockedRename = vi.mocked(renameFileForUser);
const mockedDispatch = vi.mocked(dispatchEvent);

beforeEach(() => {
  vi.clearAllMocks();
  mockedScope.mockResolvedValue(ok({ userId: 'user-1' }));
  mockedRename.mockResolvedValue(ok(fakeFile({ originalName: 'new.pdf' })));
  mockedDispatch.mockResolvedValue(ok(undefined));
});

describe('renameFile', () => {
  it('rejects empty file name', async () => {
    const r = await renameFile({ fileId: 'file-1', originalName: '' });
    expect(r.isErr()).toBe(true);
    expect(mockedRename).not.toHaveBeenCalled();
  });

  it('trims the new name', async () => {
    await renameFile({ fileId: 'file-1', originalName: '  abc.pdf  ' });
    expect(mockedRename.mock.calls[0]?.[0]?.originalName).toBe('abc.pdf');
  });

  it('returns scope error', async () => {
    mockedScope.mockResolvedValue(err(notFound('no scope', 'organization')));
    const r = await renameFile({ fileId: 'f', originalName: 'x' });
    expect(r.isErr()).toBe(true);
  });

  it('returns repo error verbatim', async () => {
    mockedRename.mockResolvedValueOnce(err(notFound('no file', 'file')));
    const r = await renameFile({ fileId: 'f', originalName: 'x' });
    expect(r.isErr()).toBe(true);
  });

  it('dispatches FILE UPDATE sync event', async () => {
    await renameFile({ fileId: 'file-1', originalName: 'x.pdf' });
    expect(mockedDispatch).toHaveBeenCalledOnce();
    const ev = mockedDispatch.mock.calls[0]?.[0];
    expect(ev?.entityType).toBe('file');
    expect(ev?.operation).toBe('update');
  });

  it('still returns ok when ZE dispatch fails (logs warn, continues)', async () => {
    mockedDispatch.mockResolvedValueOnce(err(unknownErr('ze down')));
    const r = await renameFile({ fileId: 'f', originalName: 'x' });
    expect(r.isOk()).toBe(true);
  });
});
