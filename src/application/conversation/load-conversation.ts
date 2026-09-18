import 'server-only';

import type { UIMessage } from 'ai';
import { err, ok, type Result } from 'neverthrow';
import { getCurrentUser } from '@/application/me/get-current-user';
import type { AppError } from '@/core/errors';
import { assertThreadOwnership } from '@/infra/data-access/conversation/conversation-repo';
import { mastraMessageStore } from '@/infra/data-access/conversation/mastra-message-store.adapter';
import { log } from '@/shared/logger';
import { DEFAULT_MESSAGES_PAGE_SIZE } from './messages-page-size';
import type { MessageCursor } from './ports/message-store.port';

export type LoadedConversation = {
  conversationId: string;
  messages: UIMessage[];
  hasMore: boolean;
  oldestCursor: MessageCursor | null;
};

export async function loadConversation(
  threadId: string,
): Promise<Result<LoadedConversation, AppError>> {
  const me = await getCurrentUser();
  if (me.isErr()) return err(me.error);

  log.info('conversation.load.start', { userId: me.value.id, threadId });

  const owned = await assertThreadOwnership({ userId: me.value.id, threadId });
  if (owned.isErr()) return err(owned.error);

  const page = await mastraMessageStore.listMessagesPage({
    userId: me.value.id,
    threadId,
    perPage: DEFAULT_MESSAGES_PAGE_SIZE,
  });
  if (page.isErr()) {
    log.error('conversation.load.failed', page.error, {
      userId: me.value.id,
      threadId,
    });
    return err(page.error);
  }

  log.info('conversation.load.success', {
    userId: me.value.id,
    threadId,
    count: page.value.messages.length,
    hasMore: page.value.hasMore,
  });

  return ok({
    conversationId: threadId,
    messages: page.value.messages,
    hasMore: page.value.hasMore,
    oldestCursor: page.value.oldestCursor,
  });
}
