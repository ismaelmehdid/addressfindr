import { err, ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/application/me/get-current-user', () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock('@/infra/data-access/conversation/conversation-repo', () => ({
  renameConversationForUser: vi.fn(),
}));

import { getCurrentUser } from '@/application/me/get-current-user';
import { notFound, unauthorized } from '@/core/errors';
import { renameConversationForUser } from '@/infra/data-access/conversation/conversation-repo';
import { renameConversation } from './rename-conversation';

const mockedUser = vi.mocked(getCurrentUser);
const mockedRename = vi.mocked(renameConversationForUser);

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
  mockedRename.mockResolvedValue(
    ok({ id: 'thread-1', title: 'Renamed' } as never),
  );
});

describe('renameConversation', () => {
  it('rejects whitespace-only title', async () => {
    const r = await renameConversation({ threadId: 't', title: '   ' });
    expect(r.isErr()).toBe(true);
    if (r.isErr()) expect(r.error.code).toBe('validation');
    expect(mockedRename).not.toHaveBeenCalled();
  });

  it('rejects oversize title (>120 chars)', async () => {
    const r = await renameConversation({
      threadId: 't',
      title: 'x'.repeat(121),
    });
    expect(r.isErr()).toBe(true);
  });

  it('trims title before passing through', async () => {
    await renameConversation({ threadId: 't', title: '  Hello  ' });
    expect(mockedRename.mock.calls[0]?.[0]?.title).toBe('Hello');
  });

  it('returns user error', async () => {
    mockedUser.mockResolvedValue(err(unauthorized('no')));
    const r = await renameConversation({ threadId: 't', title: 'X' });
    expect(r.isErr()).toBe(true);
  });

  it('returns repo error', async () => {
    mockedRename.mockResolvedValueOnce(err(notFound('no thread', 'thread')));
    const r = await renameConversation({ threadId: 't', title: 'X' });
    expect(r.isErr()).toBe(true);
  });
});
