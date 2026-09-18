import 'server-only';

import { err, type Result } from 'neverthrow';
import { getCurrentUser } from '@/application/me/get-current-user';
import { type AppError, validation } from '@/core/errors';
import {
  type ConversationSummary,
  renameConversationForUser,
} from '@/infra/data-access/conversation/conversation-repo';

const MAX_TITLE_LENGTH = 120;

export async function renameConversation(args: {
  threadId: string;
  title: string;
}): Promise<Result<ConversationSummary, AppError>> {
  const trimmed = args.title.trim();
  if (trimmed.length === 0) {
    return err(validation('Title cannot be empty', 'title'));
  }
  if (trimmed.length > MAX_TITLE_LENGTH) {
    return err(validation('Title is too long', 'title'));
  }

  const me = await getCurrentUser();
  if (me.isErr()) return err(me.error);

  return renameConversationForUser({
    userId: me.value.id,
    threadId: args.threadId,
    title: trimmed,
  });
}
