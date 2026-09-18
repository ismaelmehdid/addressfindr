import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  activateConversation,
  clearActiveConversation,
  deleteConversation,
  fetchConversations,
  fetchOlderMessages,
  renameConversation,
} from '@/app/(app)/dashboard/components/chat/chat-history-api';

const mockFetch = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', mockFetch);
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('fetchConversations', () => {
  it('returns the page payload on success', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ items: [{ id: 'a' }], hasMore: true, page: 2 }),
    );

    const result = await fetchConversations({ page: 2 });

    expect(mockFetch).toHaveBeenCalledWith('/api/conversations?page=2');
    expect(result.page).toBe(2);
    expect(result.items).toHaveLength(1);
  });

  it('falls back to an empty page when the request fails', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ error: 'unauthorized' }, 401));

    const result = await fetchConversations({ page: 3 });

    expect(result).toEqual({ items: [], hasMore: false, page: 3 });
  });

  it('falls back to an empty page when fetch throws', async () => {
    mockFetch.mockRejectedValue(new Error('offline'));

    const result = await fetchConversations({ page: 0 });

    expect(result).toEqual({ items: [], hasMore: false, page: 0 });
  });
});

describe('activateConversation', () => {
  it('POSTs to the activate route and unwraps the payload', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ conversationId: 't-1', messages: [], hasMore: false }),
    );

    const result = await activateConversation('t-1');

    expect(mockFetch).toHaveBeenCalledWith('/api/conversations/t-1/activate', {
      method: 'POST',
    });
    expect(result).toEqual({
      ok: true,
      data: { conversationId: 't-1', messages: [], hasMore: false },
    });
  });

  it('reports failure on a non-ok response', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ error: 'not_found' }, 404));

    expect(await activateConversation('missing')).toEqual({ ok: false });
  });

  it('encodes the thread id into the path', async () => {
    mockFetch.mockResolvedValue(jsonResponse({}));

    await activateConversation('a/b');

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/conversations/a%2Fb/activate',
      { method: 'POST' },
    );
  });
});

describe('renameConversation', () => {
  it('PATCHes the title as JSON', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ id: 't-1', title: 'New' }));

    const result = await renameConversation({ threadId: 't-1', title: 'New' });

    expect(mockFetch).toHaveBeenCalledWith('/api/conversations/t-1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'New' }),
    });
    expect(result).toEqual({ ok: true, data: { id: 't-1', title: 'New' } });
  });

  it('reports failure when the server rejects the title', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ error: 'validation' }, 400));

    expect(await renameConversation({ threadId: 't-1', title: '' })).toEqual({
      ok: false,
    });
  });
});

describe('deleteConversation', () => {
  it('DELETEs and succeeds on a 204 with no body', async () => {
    mockFetch.mockResolvedValue(new Response(null, { status: 204 }));

    const result = await deleteConversation('t-1');

    expect(mockFetch).toHaveBeenCalledWith('/api/conversations/t-1', {
      method: 'DELETE',
    });
    expect(result).toEqual({ ok: true, data: undefined });
  });

  it('reports failure on a non-ok response', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ error: 'not_found' }, 404));

    expect(await deleteConversation('t-1')).toEqual({ ok: false });
  });
});

describe('fetchOlderMessages', () => {
  it('sends the cursor as query parameters', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ messages: [], hasMore: false, oldestCursor: null }),
    );

    const result = await fetchOlderMessages({
      threadId: 't-1',
      before: { createdAt: '2026-01-01T00:00:00.000Z', id: 'm-1' },
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/conversations/t-1/messages?beforeCreatedAt=2026-01-01T00%3A00%3A00.000Z&beforeId=m-1',
    );
    expect(result.ok).toBe(true);
  });

  it('reports failure when the request errors', async () => {
    mockFetch.mockRejectedValue(new Error('offline'));

    const result = await fetchOlderMessages({
      threadId: 't-1',
      before: { createdAt: '2026-01-01T00:00:00.000Z', id: 'm-1' },
    });

    expect(result).toEqual({ ok: false });
  });
});

describe('clearActiveConversation', () => {
  it('DELETEs the active-conversation route', async () => {
    mockFetch.mockResolvedValue(new Response(null, { status: 204 }));

    await clearActiveConversation();

    expect(mockFetch).toHaveBeenCalledWith('/api/conversations/active', {
      method: 'DELETE',
    });
  });

  it('swallows network errors so the new-chat reset still completes', async () => {
    mockFetch.mockRejectedValue(new Error('offline'));

    await expect(clearActiveConversation()).resolves.toBeUndefined();
  });
});
