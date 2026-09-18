import 'server-only';

import { err, ok, type Result } from 'neverthrow';
import type {
  ListMessagesPageInput,
  MessageStorePort,
  MessagesPage,
} from '@/application/conversation/ports/message-store.port';
import { type AppError, unknown } from '@/core/errors';
import { getMastraMessageStore } from '@/infra/external-apis/mastra/storage-bootstrap';
import { log } from '@/shared/logger';
import { buildCursor, dropBeforeCursor } from './cursor';
import { mastraMessagesToUIMessages } from './mastra-to-ui-message';

async function listMessagesPage(
  input: ListMessagesPageInput,
): Promise<Result<MessagesPage, AppError>> {
  const storeResult = await getMastraMessageStore();
  if (storeResult.isErr()) return err(storeResult.error);
  const store = storeResult.value;

  const beforeDate = input.before ? new Date(input.before.createdAt) : null;
  if (input.before && beforeDate && Number.isNaN(beforeDate.getTime())) {
    return err(unknown('Invalid cursor.createdAt'));
  }

  const overfetch = input.before ? input.perPage + 1 : input.perPage;

  try {
    const raw = await store.listMessages({
      threadId: input.threadId,
      resourceId: input.userId,
      perPage: overfetch,
      page: 0,
      orderBy: { field: 'createdAt', direction: 'DESC' },
      filter: beforeDate
        ? { dateRange: { end: beforeDate, endExclusive: false } }
        : undefined,
    });

    const filtered = input.before
      ? dropBeforeCursor(raw.messages, input.before)
      : [...raw.messages];

    const trimmed = filtered.slice(0, input.perPage);
    const chronological = [...trimmed].reverse();
    const hasMore = raw.hasMore || filtered.length > input.perPage;

    return ok({
      messages: mastraMessagesToUIMessages(chronological),
      hasMore,
      oldestCursor: buildCursor(chronological[0]),
    });
  } catch (e) {
    log.error('conversation.list_messages_page.failed', e, {
      threadId: input.threadId,
      userId: input.userId,
      hasBefore: Boolean(input.before),
    });
    return err(unknown('Failed to list messages page'));
  }
}

export const mastraMessageStore: MessageStorePort = {
  listMessagesPage,
};
