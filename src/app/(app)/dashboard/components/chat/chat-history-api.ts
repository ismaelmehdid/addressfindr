import type { MessageCursor } from '@/application/conversation/ports/message-store.port';
import type {
  ConversationPage,
  ConversationSummary,
  OlderMessagesResult,
  RequestResult,
  SwitchedConversation,
} from './chat-history-types';

const EMPTY_PAGE = (page: number): ConversationPage => ({
  items: [],
  hasMore: false,
  page,
});

async function readJson<T>(res: Response): Promise<RequestResult<T>> {
  if (!res.ok) return { ok: false };
  return { ok: true, data: (await res.json()) as T };
}

export async function fetchConversations(args: {
  page: number;
}): Promise<ConversationPage> {
  try {
    const res = await fetch(`/api/conversations?page=${args.page}`);
    if (!res.ok) return EMPTY_PAGE(args.page);
    return (await res.json()) as ConversationPage;
  } catch {
    return EMPTY_PAGE(args.page);
  }
}

export async function activateConversation(
  threadId: string,
): Promise<RequestResult<SwitchedConversation>> {
  try {
    const res = await fetch(
      `/api/conversations/${encodeURIComponent(threadId)}/activate`,
      { method: 'POST' },
    );
    return readJson<SwitchedConversation>(res);
  } catch {
    return { ok: false };
  }
}

export async function renameConversation(args: {
  threadId: string;
  title: string;
}): Promise<RequestResult<ConversationSummary>> {
  try {
    const res = await fetch(
      `/api/conversations/${encodeURIComponent(args.threadId)}`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: args.title }),
      },
    );
    return readJson<ConversationSummary>(res);
  } catch {
    return { ok: false };
  }
}

export async function deleteConversation(
  threadId: string,
): Promise<RequestResult<void>> {
  try {
    const res = await fetch(
      `/api/conversations/${encodeURIComponent(threadId)}`,
      { method: 'DELETE' },
    );
    if (!res.ok) return { ok: false };
    return { ok: true, data: undefined };
  } catch {
    return { ok: false };
  }
}

export async function fetchOlderMessages(args: {
  threadId: string;
  before: MessageCursor;
}): Promise<RequestResult<OlderMessagesResult>> {
  const query = new URLSearchParams({
    beforeCreatedAt: args.before.createdAt,
    beforeId: args.before.id,
  });
  try {
    const res = await fetch(
      `/api/conversations/${encodeURIComponent(args.threadId)}/messages?${query}`,
    );
    return readJson<OlderMessagesResult>(res);
  } catch {
    return { ok: false };
  }
}

export async function clearActiveConversation(): Promise<void> {
  try {
    await fetch('/api/conversations/active', { method: 'DELETE' });
  } catch {
    // Best-effort: the new-chat UI has already reset locally.
  }
}
