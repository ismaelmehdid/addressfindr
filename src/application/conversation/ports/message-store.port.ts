import type { UIMessage } from 'ai';
import type { Result } from 'neverthrow';
import type { AppError } from '@/core/errors';

export type MessageCursor = {
  createdAt: string;
  id: string;
};

export type MessagesPage = {
  messages: UIMessage[];
  hasMore: boolean;
  oldestCursor: MessageCursor | null;
};

export type ListMessagesPageInput = {
  userId: string;
  threadId: string;
  perPage: number;
  before?: MessageCursor;
};

export type MessageStorePort = {
  listMessagesPage(
    input: ListMessagesPageInput,
  ): Promise<Result<MessagesPage, AppError>>;
};
