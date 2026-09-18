import { err, ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock(
  '@/infra/data-access/conversation/mastra-message-store.adapter',
  () => ({ mastraMessageStore: { listMessagesPage: vi.fn() } }),
);

import { CHAT_AGENT } from '@/core/agents/agent-ids';
import { notFound } from '@/core/errors';
import { mastraMessageStore } from '@/infra/data-access/conversation/mastra-message-store.adapter';
import { lastAssistantAgentIdFromThread } from './last-agent-from-thread';

const mockedList = vi.mocked(mastraMessageStore.listMessagesPage);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('lastAssistantAgentIdFromThread', () => {
  it('returns null when store errors', async () => {
    mockedList.mockResolvedValueOnce(err(notFound('boom', 'message')));
    const r = await lastAssistantAgentIdFromThread({
      threadId: 't',
      userId: 'u',
    });
    expect(r).toBeNull();
  });

  it('returns null when no assistant messages', async () => {
    mockedList.mockResolvedValueOnce(
      ok({
        messages: [{ role: 'user', metadata: undefined } as never],
        hasMore: false,
        oldestCursor: null,
      }),
    );
    const r = await lastAssistantAgentIdFromThread({
      threadId: 't',
      userId: 'u',
    });
    expect(r).toBeNull();
  });

  it('returns the most recent assistant agentId from metadata', async () => {
    mockedList.mockResolvedValueOnce(
      ok({
        messages: [
          {
            role: 'assistant',
            metadata: { agentId: CHAT_AGENT.HELP },
          } as never,
          { role: 'user', metadata: undefined } as never,
          {
            role: 'assistant',
            metadata: { agentId: CHAT_AGENT.KNOWLEDGE },
          } as never,
        ],
        hasMore: false,
        oldestCursor: null,
      }),
    );
    const r = await lastAssistantAgentIdFromThread({
      threadId: 't',
      userId: 'u',
    });
    expect(r).toBe(CHAT_AGENT.KNOWLEDGE);
  });

  it('rejects unknown agent strings (defense-in-depth)', async () => {
    mockedList.mockResolvedValueOnce(
      ok({
        messages: [
          { role: 'assistant', metadata: { agentId: 'evil-agent' } } as never,
        ],
        hasMore: false,
        oldestCursor: null,
      }),
    );
    const r = await lastAssistantAgentIdFromThread({
      threadId: 't',
      userId: 'u',
    });
    expect(r).toBeNull();
  });

  it('ignores assistant messages without metadata.agentId and falls through', async () => {
    mockedList.mockResolvedValueOnce(
      ok({
        messages: [
          {
            role: 'assistant',
            metadata: { agentId: CHAT_AGENT.KNOWLEDGE },
          } as never,
          { role: 'assistant', metadata: undefined } as never,
        ],
        hasMore: false,
        oldestCursor: null,
      }),
    );
    const r = await lastAssistantAgentIdFromThread({
      threadId: 't',
      userId: 'u',
    });
    // most recent assistant has no agentId; falls back to the older one
    expect(r).toBe(CHAT_AGENT.KNOWLEDGE);
  });
});
