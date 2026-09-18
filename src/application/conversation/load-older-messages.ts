import 'server-only';

import { err, type Result } from 'neverthrow';
import { getCurrentUser } from '@/application/me/get-current-user';
import type { AppError } from '@/core/errors';
import { assertThreadOwnership } from '@/infra/data-access/conversation/conversation-repo';
import { mastraMessageStore } from '@/infra/data-access/conversation/mastra-message-store.adapter';
import { log } from '@/shared/logger';
import { DEFAULT_MESSAGES_PAGE_SIZE } from './messages-page-size';
import type { MessageCursor, MessagesPage } from './ports/message-store.port';

export type { MessageCursor, MessagesPage };

export async function loadOlderMessages(args: {
  threadId: string;
  before: MessageCursor;
}): Promise<Result<MessagesPage, AppError>> {
  const me = await getCurrentUser();
  if (me.isErr()) return err(me.error);

  log.info('conversation.load_older.start', {
    userId: me.value.id,
    threadId: args.threadId,
    cursor: args.before,
  });

  const owned = await assertThreadOwnership({
    userId: me.value.id,
    threadId: args.threadId,
  });
  if (owned.isErr()) return err(owned.error);

  const page = await mastraMessageStore.listMessagesPage({
    userId: me.value.id,
    threadId: args.threadId,
    perPage: DEFAULT_MESSAGES_PAGE_SIZE,
    before: args.before,
  });
  if (page.isErr()) {
    log.error('conversation.load_older.failed', page.error, {
      userId: me.value.id,
      threadId: args.threadId,
    });
    return page;
  }

  log.info('conversation.load_older.success', {
    userId: me.value.id,
    threadId: args.threadId,
    count: page.value.messages.length,
    hasMore: page.value.hasMore,
  });

  return page;
}
