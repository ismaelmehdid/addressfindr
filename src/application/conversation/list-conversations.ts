import 'server-only';

import { err, type Result } from 'neverthrow';
import { getCurrentUser } from '@/application/me/get-current-user';
import type { AppError } from '@/core/errors';
import {
  type ConversationPage,
  type ConversationSummary,
  listConversationsByUser,
} from '@/infra/data-access/conversation/conversation-repo';

export type { ConversationPage, ConversationSummary };

export async function listConversations(args: {
  page: number;
  perPage: number;
}): Promise<Result<ConversationPage, AppError>> {
  const me = await getCurrentUser();
  if (me.isErr()) return err(me.error);
  return listConversationsByUser({
    userId: me.value.id,
    page: args.page,
    perPage: args.perPage,
  });
}
