import 'server-only';

import { CHAT_AGENT, type ChatAgentId } from '@/core/agents/agent-ids';
import {
  composeChatSystemPrompt,
  composeHelpAgentSystemPrompt,
  composeKnowledgeAgentSystemPrompt,
} from '@/core/agents/chat-system-prompt/compose';
import { openaiModelString } from '@/core/agents/model-tier';
import { env } from '@/shared/env';
import { fetchUrlTool } from './tools/fetch-url';
import { highlightUiElementTool } from './tools/highlight-ui-element';
import { listFilesTool } from './tools/list-files';
import { searchFileTextTool } from './tools/search-file-text';
import { searchUserFilesTool } from './tools/search-user-files';
import { webSearchTool } from './tools/web-search';

const e = env();
const webSearchEnabled = Boolean(e.BRAVE_SEARCH_API_KEY);

const knowledgeTools = {
  searchUserFiles: searchUserFilesTool,
  searchFileText: searchFileTextTool,
  listFiles: listFilesTool,
  fetchUrl: fetchUrlTool,
  ...(webSearchEnabled ? { webSearch: webSearchTool } : {}),
};

export const agentDefinitions = {
  [CHAT_AGENT.GENERALIST]: {
    name: 'Chat',
    instructions: composeChatSystemPrompt({ webSearch: webSearchEnabled }),
    model: openaiModelString(e.CHAT_MODEL),
    tools: { ...knowledgeTools },
  },
  [CHAT_AGENT.HELP]: {
    name: 'ChatHelp',
    instructions: composeHelpAgentSystemPrompt(),
    model: openaiModelString(e.CHEAP_MODEL),
    tools: { highlightUiElement: highlightUiElementTool },
  },
  [CHAT_AGENT.KNOWLEDGE]: {
    name: 'ChatKnowledge',
    instructions: composeKnowledgeAgentSystemPrompt({
      webSearch: webSearchEnabled,
    }),
    model: openaiModelString(e.CHAT_MODEL),
    tools: { ...knowledgeTools },
  },
} satisfies Record<
  ChatAgentId,
  { name: string; instructions: string; model: string; tools: object }
>;
