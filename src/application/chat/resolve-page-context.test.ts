import { err, ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/application/files/get-file-entity', () => ({
  getFileEntityForOrg: vi.fn(),
}));

import { getFileEntityForOrg } from '@/application/files/get-file-entity';
import { PageContextKind } from '@/core/chat/page-context';
import { notFound } from '@/core/errors';
import { resolvePageContextToSystemPrompt } from './resolve-page-context';

const mockedFile = vi.mocked(getFileEntityForOrg);

const SCOPE = { userId: 'user-1', organizationId: 'org-1' };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('resolvePageContextToSystemPrompt', () => {
  it('returns empty for undefined context', async () => {
    const r = await resolvePageContextToSystemPrompt({
      pageContext: undefined,
      ...SCOPE,
    });
    expect(r.systemPrompt).toBeNull();
    expect(r.attributes).toEqual({});
  });

  it('returns empty for NONE context', async () => {
    const r = await resolvePageContextToSystemPrompt({
      pageContext: { kind: PageContextKind.NONE },
      ...SCOPE,
    });
    expect(r.systemPrompt).toBeNull();
  });

  it('returns empty when storage file lookup fails', async () => {
    mockedFile.mockResolvedValueOnce(err(notFound('nope', 'file')));
    const r = await resolvePageContextToSystemPrompt({
      pageContext: { kind: PageContextKind.STORAGE_FILE, id: 'f1' },
      ...SCOPE,
    });
    expect(r.systemPrompt).toBeNull();
  });

  it('returns storage-file prompt with file metadata', async () => {
    mockedFile.mockResolvedValueOnce(
      ok({
        id: 'f1',
        originalName: 'report.pdf',
        fileType: 'pdf',
      } as never),
    );
    const r = await resolvePageContextToSystemPrompt({
      pageContext: { kind: PageContextKind.STORAGE_FILE, id: 'f1' },
      ...SCOPE,
    });
    expect(r.systemPrompt).toContain('report.pdf');
    expect(r.systemPrompt).toContain('fileId="f1"');
    expect(r.systemPrompt).toContain('searchFileText');
    expect(r.attributes).toEqual({
      'chat.page_context.kind': PageContextKind.STORAGE_FILE,
      'chat.page_context.entity_id': 'f1',
    });
  });

  it('swallows unexpected errors and returns empty', async () => {
    mockedFile.mockRejectedValueOnce(new Error('boom'));
    const r = await resolvePageContextToSystemPrompt({
      pageContext: { kind: PageContextKind.STORAGE_FILE, id: 'f1' },
      ...SCOPE,
    });
    expect(r.systemPrompt).toBeNull();
  });
});
