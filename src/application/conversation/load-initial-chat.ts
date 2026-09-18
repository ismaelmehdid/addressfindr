import 'server-only';

import type { UIMessage } from 'ai';
import { cookies } from 'next/headers';
import { getCurrentUser } from '@/application/me/get-current-user';
import { LAST_CONVERSATION_COOKIE } from '@/core/conversation/cookies';
import { assertThreadOwnership } from '@/infra/data-access/conversation/conversation-repo';
import { mastraMessageStore } from '@/infra/data-access/conversation/mastra-message-store.adapter';
import { log } from '@/shared/logger';
import { DEFAULT_MESSAGES_PAGE_SIZE } from './messages-page-size';
import type { MessageCursor } from './ports/message-store.port';

export type InitialChatState = {
  conversationId: string | null;
  messages: UIMessage[];
  hasMore: boolean;
  oldestCursor: MessageCursor | null;
};

const EMPTY: InitialChatState = {
  conversationId: null,
  messages: [],
  hasMore: false,
  oldestCursor: null,
};

export async function loadInitialChat(): Promise<InitialChatState> {
  const me = await getCurrentUser();
  if (me.isErr()) return EMPTY;
  if (!me.value.organizationId) return EMPTY;

  const cookieStore = await cookies();
  const threadId = cookieStore.get(LAST_CONVERSATION_COOKIE)?.value;
  if (!threadId) return EMPTY;

  log.info('conversation.load_initial.start', {
    userId: me.value.id,
    threadId,
  });

  const owned = await assertThreadOwnership({ userId: me.value.id, threadId });
  if (owned.isErr()) return EMPTY;

  const page = await mastraMessageStore.listMessagesPage({
    userId: me.value.id,
    threadId,
    perPage: DEFAULT_MESSAGES_PAGE_SIZE,
  });
  if (page.isErr()) {
    log.error('conversation.load_initial.failed', page.error, {
      userId: me.value.id,
      threadId,
    });
    return EMPTY;
  }

  log.info('conversation.load_initial.success', {
    userId: me.value.id,
    threadId,
    count: page.value.messages.length,
    hasMore: page.value.hasMore,
  });

  return {
    conversationId: threadId,
    messages: page.value.messages,
    hasMore: page.value.hasMore,
    oldestCursor: page.value.oldestCursor,
  };
}
