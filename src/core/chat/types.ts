export const VISION_CAPABLE_CHAT_MODELS = [
  'gpt-5.5',
  'gpt-5.4',
  'gpt-5.4-mini',
  'gpt-5.4-nano',
] as const;
export type VisionCapableChatModel =
  (typeof VISION_CAPABLE_CHAT_MODELS)[number];

export const CHEAP_CHAT_MODELS = ['gpt-5.4-nano'] as const;
export type CheapChatModel = (typeof CHEAP_CHAT_MODELS)[number];
