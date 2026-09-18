import { err, ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/application/me/get-current-user', () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock('@/infra/data-access/conversation/conversation-repo', () => ({
  deleteConversationForUser: vi.fn(),
}));

import { getCurrentUser } from '@/application/me/get-current-user';
import { notFound, unauthorized } from '@/core/errors';
import { deleteConversationForUser } from '@/infra/data-access/conversation/conversation-repo';
import { deleteConversation } from './delete-conversation';

const mockedUser = vi.mocked(getCurrentUser);
const mockedDelete = vi.mocked(deleteConversationForUser);

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
  mockedDelete.mockResolvedValue(ok(undefined));
});

describe('deleteConversation', () => {
  it('returns user error when unauthorized', async () => {
    mockedUser.mockResolvedValue(err(unauthorized('not signed in')));
    const r = await deleteConversation('thread-1');
    expect(r.isErr()).toBe(true);
    expect(mockedDelete).not.toHaveBeenCalled();
  });

  it('forwards user id and thread id to repo', async () => {
    await deleteConversation('thread-7');
    expect(mockedDelete).toHaveBeenCalledWith({
      userId: 'user-1',
      threadId: 'thread-7',
    });
  });

  it('returns repo error verbatim', async () => {
    mockedDelete.mockResolvedValueOnce(
      err(notFound('thread missing', 'conversation')),
    );
    const r = await deleteConversation('thread-1');
    expect(r.isErr()).toBe(true);
  });
});
