import 'server-only';

import { err, type Result } from 'neverthrow';
import { getCurrentUser } from '@/application/me/get-current-user';
import type { AppError } from '@/core/errors';
import { deleteConversationForUser } from '@/infra/data-access/conversation/conversation-repo';

export async function deleteConversation(
  threadId: string,
): Promise<Result<void, AppError>> {
  const me = await getCurrentUser();
  if (me.isErr()) return err(me.error);
  return deleteConversationForUser({ userId: me.value.id, threadId });
}
