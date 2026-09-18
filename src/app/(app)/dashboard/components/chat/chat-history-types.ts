import type { UIMessage } from 'ai';
import type { MessageCursor } from '@/application/conversation/ports/message-store.port';

export type RequestResult<T> = { ok: true; data: T } | { ok: false };

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

export type SwitchedConversation = {
  conversationId: string;
  messages: UIMessage[];
  hasMore: boolean;
  oldestCursor: MessageCursor | null;
};

export type OlderMessagesResult = {
  messages: UIMessage[];
  hasMore: boolean;
  oldestCursor: MessageCursor | null;
};
