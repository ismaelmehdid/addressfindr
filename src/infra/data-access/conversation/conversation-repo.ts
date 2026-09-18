import 'server-only';

import { err, ok, type Result } from 'neverthrow';
import { type AppError, notFound, unknown } from '@/core/errors';
import { memory } from '@/infra/external-apis/mastra/instance';
import { log } from '@/shared/logger';

export type ConversationSummary = {
  id: string;
  title: string | null;
  updatedAt: string;
};

export type ConversationPage = {
  items: ConversationSummary[];
  hasMore: boolean;
  page: number;
};

type StoredThread = NonNullable<
  Awaited<ReturnType<typeof memory.getThreadById>>
>;

export async function assertThreadOwnership(args: {
  userId: string;
  threadId: string;
}): Promise<Result<StoredThread, AppError>> {
  try {
    const thread = await memory.getThreadById({
      threadId: args.threadId,
      resourceId: args.userId,
    });
    if (!thread) return err(notFound('Conversation not found', 'conversation'));
    return ok(thread);
  } catch (e) {
    log.error('conversation.assert_ownership.failed', e, {
      threadId: args.threadId,
      userId: args.userId,
    });
    return err(unknown('Failed to verify conversation ownership'));
  }
}

export async function listConversationsByUser(args: {
  userId: string;
  page: number;
  perPage: number;
}): Promise<Result<ConversationPage, AppError>> {
  try {
    const result = await memory.listThreads({
      filter: { resourceId: args.userId },
      orderBy: { field: 'updatedAt', direction: 'DESC' },
      page: args.page,
      perPage: args.perPage,
    });
    return ok({
      items: result.threads.map((t) => ({
        id: t.id,
        title: t.title ?? null,
        updatedAt: t.updatedAt.toISOString(),
      })),
      hasMore: result.hasMore,
      page: args.page,
    });
  } catch (e) {
    log.error('conversation.list.failed', e, { userId: args.userId });
    return err(unknown('Failed to list conversations'));
  }
}

export async function renameConversationForUser(args: {
  userId: string;
  threadId: string;
  title: string;
}): Promise<Result<ConversationSummary, AppError>> {
  const owned = await assertThreadOwnership(args);
  if (owned.isErr()) return err(owned.error);
  try {
    const updated = await memory.updateThread({
      id: args.threadId,
      title: args.title,
      metadata: owned.value.metadata ?? {},
    });
    return ok({
      id: updated.id,
      title: updated.title ?? null,
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch (e) {
    log.error('conversation.rename.failed', e, {
      threadId: args.threadId,
      userId: args.userId,
    });
    return err(unknown('Failed to rename conversation'));
  }
}

export async function deleteConversationForUser(args: {
  userId: string;
  threadId: string;
}): Promise<Result<void, AppError>> {
  const owned = await assertThreadOwnership(args);
  if (owned.isErr()) return err(owned.error);
  try {
    await memory.deleteThread(args.threadId);
    return ok(undefined);
  } catch (e) {
    log.error('conversation.delete.failed', e, {
      threadId: args.threadId,
      userId: args.userId,
    });
    return err(unknown('Failed to delete conversation'));
  }
}
