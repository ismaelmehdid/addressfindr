import type { CheapChatModel, VisionCapableChatModel } from '@/core/chat/types';

export const MODEL_TIER = {
  MAIN: 'main',
  CHEAP: 'cheap',
} as const;
export type ModelTier = (typeof MODEL_TIER)[keyof typeof MODEL_TIER];

export type ModelTierMap = {
  readonly main: VisionCapableChatModel;
  readonly cheap: CheapChatModel;
};

export function pickModel<T extends ModelTier>(
  map: ModelTierMap,
  tier: T,
): ModelTierMap[T] {
  return map[tier];
}

export function openaiModelString(model: string): string {
  return `openai/${model}`;
}
