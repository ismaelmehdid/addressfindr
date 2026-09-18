import { ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/application/me/organization-scope', () => ({
  requireOrganizationScope: vi.fn(),
}));

vi.mock('@/application/files/get-file-entity', () => ({
  getFileEntitiesByIds: vi.fn(),
  getFileEntityForUser: vi.fn(),
}));

vi.mock('@/application/retrieval/multi-query-search', () => ({
  multiQuerySearch: vi.fn(),
}));

vi.mock('./collection-service', () => ({
  ensureCollection: vi.fn(),
}));

import { getFileEntitiesByIds } from '@/application/files/get-file-entity';
import { requireOrganizationScope } from '@/application/me/organization-scope';
import { multiQuerySearch } from '@/application/retrieval/multi-query-search';
import { ensureCollection } from './collection-service';
import { searchUserFiles } from './query-snippets';

const mockedScope = vi.mocked(requireOrganizationScope);
const mockedEnsureCollection = vi.mocked(ensureCollection);
const mockedSearch = vi.mocked(multiQuerySearch);
const mockedGetFiles = vi.mocked(getFileEntitiesByIds);

beforeEach(() => {
  vi.clearAllMocks();
  mockedScope.mockResolvedValue(
    ok({ userId: 'user-a', organizationId: 'org-1' }),
  );
  mockedEnsureCollection.mockResolvedValue(
    ok({
      id: 'coll-a',
      collectionName: 'app-entities-user-a',
      userId: 'user-a',
      status: 'active',
      documentCount: 2,
      lastSyncAt: null,
      lastSyncError: null,
    } as never),
  );
});

describe('searchUserFiles', () => {
  it('drops a snippet whose entity is not owned by the current user', async () => {
    // Both snippets come back from the SAME (per-user) ZeroEntropy
    // collection query — the only thing distinguishing "mine" from
    // "not mine" here is which entityId getFileEntitiesByIds (already
    // userId-filtered) actually resolved.
    mockedSearch.mockResolvedValue(
      ok([
        {
          path: 'entities/user-a/file/file-a/content',
          content: 'mine',
          score: 0.9,
          pageSpan: null,
          documentMetadata: {},
        },
        {
          path: 'entities/user-b/file/file-b/content',
          content: 'not mine',
          score: 0.9,
          pageSpan: null,
          documentMetadata: {},
        },
      ] as never),
    );
    mockedGetFiles.mockResolvedValue(
      ok([{ id: 'file-a', originalName: 'mine.pdf' } as never]),
    );

    const result = await searchUserFiles({ query: 'test', k: 10 });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value.map((s) => s.source.fileId)).toEqual(['file-a']);
  });

  it('keeps every snippet whose entity the user owns', async () => {
    mockedSearch.mockResolvedValue(
      ok([
        {
          path: 'entities/user-a/file/file-a/content',
          content: 'mine',
          score: 0.9,
          pageSpan: null,
          documentMetadata: {},
        },
      ] as never),
    );
    mockedGetFiles.mockResolvedValue(
      ok([{ id: 'file-a', originalName: 'mine.pdf' } as never]),
    );

    const result = await searchUserFiles({ query: 'test', k: 10 });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value).toHaveLength(1);
    expect(result.value[0]?.source.fileName).toBe('mine.pdf');
  });
});
