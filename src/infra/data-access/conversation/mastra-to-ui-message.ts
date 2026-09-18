import 'server-only';

import { toAISdkMessages } from '@mastra/ai-sdk/ui';
import type { MessageListInput } from '@mastra/core/agent/message-list';
import type { UIMessage } from 'ai';

export function mastraMessagesToUIMessages(
  messages: MessageListInput,
): UIMessage[] {
  return toAISdkMessages(messages, { version: 'v6' }) as UIMessage[];
}
