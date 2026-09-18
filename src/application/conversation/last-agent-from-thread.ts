import 'server-only';

import { ALL_CHAT_AGENT_IDS, type ChatAgentId } from '@/core/agents/agent-ids';
import { mastraMessageStore } from '@/infra/data-access/conversation/mastra-message-store.adapter';
import { log } from '@/shared/logger';

const PROBE_PAGE_SIZE = 6;

function extractAgentId(message: { metadata?: unknown }): ChatAgentId | null {
  const meta = message.metadata;
  if (!meta || typeof meta !== 'object') return null;
  const agentId = (meta as Record<string, unknown>).agentId;
  if (typeof agentId !== 'string') return null;
  return ALL_CHAT_AGENT_IDS.includes(agentId as ChatAgentId)
    ? (agentId as ChatAgentId)
    : null;
}

export async function lastAssistantAgentIdFromThread(args: {
  threadId: string;
  userId: string;
}): Promise<ChatAgentId | null> {
  const page = await mastraMessageStore.listMessagesPage({
    threadId: args.threadId,
    userId: args.userId,
    perPage: PROBE_PAGE_SIZE,
  });
  if (page.isErr()) {
    log.warn('chat.previous_agent.lookup_failed', {
      threadId: args.threadId,
      userId: args.userId,
      code: page.error.code,
    });
    return null;
  }
  for (let i = page.value.messages.length - 1; i >= 0; i -= 1) {
    const m = page.value.messages[i];
    if (!m || m.role !== 'assistant') continue;
    const agentId = extractAgentId(m);
    if (agentId) return agentId;
  }
  return null;
}
