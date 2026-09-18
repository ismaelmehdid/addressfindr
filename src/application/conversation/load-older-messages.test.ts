import { err, ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/application/me/get-current-user', () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock('@/infra/data-access/conversation/conversation-repo', () => ({
  assertThreadOwnership: vi.fn(),
}));

vi.mock(
  '@/infra/data-access/conversation/mastra-message-store.adapter',
  () => ({ mastraMessageStore: { listMessagesPage: vi.fn() } }),
);

import { getCurrentUser } from '@/application/me/get-current-user';
import { notFound, unauthorized } from '@/core/errors';
import { assertThreadOwnership } from '@/infra/data-access/conversation/conversation-repo';
import { mastraMessageStore } from '@/infra/data-access/conversation/mastra-message-store.adapter';
import { loadOlderMessages } from './load-older-messages';

const mockedUser = vi.mocked(getCurrentUser);
const mockedOwn = vi.mocked(assertThreadOwnership);
const mockedList = vi.mocked(mastraMessageStore.listMessagesPage);

const cursor = { id: 'c1', createdAt: '2024-01-01T00:00:00Z' } as never;

beforeEach(() => {
  vi.clearAllMocks();
  mockedUser.mockResolvedValue(
    ok({
      id: 'user-1',
      email: 'a@b',
      name: 'A',
      organizationId: 'org-1',
    } as never),
  );
  mockedOwn.mockResolvedValue(ok(undefined) as never);
  mockedList.mockResolvedValue(
    ok({ messages: [], hasMore: false, oldestCursor: null } as never),
  );
});

describe('loadOlderMessages', () => {
  it('returns user error', async () => {
    mockedUser.mockResolvedValue(err(unauthorized('no')));
    const r = await loadOlderMessages({ threadId: 't', before: cursor });
    expect(r.isErr()).toBe(true);
  });

  it('returns ownership error', async () => {
    mockedOwn.mockResolvedValueOnce(err(notFound('nope', 'conversation')));
    const r = await loadOlderMessages({ threadId: 't', before: cursor });
    expect(r.isErr()).toBe(true);
    expect(mockedList).not.toHaveBeenCalled();
  });

  it('passes before cursor to the store', async () => {
    await loadOlderMessages({ threadId: 't', before: cursor });
    expect(mockedList).toHaveBeenCalledWith(
      expect.objectContaining({ before: cursor, threadId: 't' }),
    );
  });

  it('returns repo list error', async () => {
    mockedList.mockResolvedValueOnce(err(notFound('boom', 'message')));
    const r = await loadOlderMessages({ threadId: 't', before: cursor });
    expect(r.isErr()).toBe(true);
  });
});
