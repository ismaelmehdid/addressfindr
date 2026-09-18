import { err, ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/application/me/get-current-user', () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock('@/infra/data-access/conversation/conversation-repo', () => ({
  listConversationsByUser: vi.fn(),
}));

import { getCurrentUser } from '@/application/me/get-current-user';
import { unauthorized } from '@/core/errors';
import { listConversationsByUser } from '@/infra/data-access/conversation/conversation-repo';
import { listConversations } from './list-conversations';

const mockedUser = vi.mocked(getCurrentUser);
const mockedList = vi.mocked(listConversationsByUser);

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
  mockedList.mockResolvedValue(
    ok({ items: [], hasMore: false, page: 1 } as never),
  );
});

describe('listConversations', () => {
  it('returns user error', async () => {
    mockedUser.mockResolvedValue(err(unauthorized('no')));
    const r = await listConversations({ page: 1, perPage: 10 });
    expect(r.isErr()).toBe(true);
  });

  it('forwards user id and pagination', async () => {
    await listConversations({ page: 2, perPage: 25 });
    expect(mockedList).toHaveBeenCalledWith({
      userId: 'user-1',
      page: 2,
      perPage: 25,
    });
  });
});
