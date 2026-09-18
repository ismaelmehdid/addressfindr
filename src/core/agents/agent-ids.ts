export const CHAT_AGENT = {
  GENERALIST: 'chat',
  KNOWLEDGE: 'chat-knowledge',
  HELP: 'chat-help',
} as const;
export type ChatAgentId = (typeof CHAT_AGENT)[keyof typeof CHAT_AGENT];

export const ALL_CHAT_AGENT_IDS: ReadonlyArray<ChatAgentId> = [
  CHAT_AGENT.GENERALIST,
  CHAT_AGENT.KNOWLEDGE,
  CHAT_AGENT.HELP,
];
