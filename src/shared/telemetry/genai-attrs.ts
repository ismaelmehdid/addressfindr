import type { SpanAttributes } from './with-span';

export const GEN_AI_SYSTEM = {
  OPENAI: 'openai',
} as const;
export type GenAiSystem = (typeof GEN_AI_SYSTEM)[keyof typeof GEN_AI_SYSTEM];

export function genAiRequestAttrs(args: {
  system: GenAiSystem;
  model: string;
  temperature?: number;
  maxOutputTokens?: number;
}): SpanAttributes {
  const attrs: SpanAttributes = {
    'gen_ai.system': args.system,
    'gen_ai.request.model': args.model,
  };
  if (args.temperature !== undefined) {
    attrs['gen_ai.request.temperature'] = args.temperature;
  }
  if (args.maxOutputTokens !== undefined) {
    attrs['gen_ai.request.max_tokens'] = args.maxOutputTokens;
  }
  return attrs;
}

export function genAiUsageAttrs(args: {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}): SpanAttributes {
  const attrs: SpanAttributes = {};
  if (args.inputTokens !== undefined) {
    attrs['gen_ai.usage.input_tokens'] = args.inputTokens;
  }
  if (args.outputTokens !== undefined) {
    attrs['gen_ai.usage.output_tokens'] = args.outputTokens;
  }
  if (args.totalTokens !== undefined) {
    attrs['gen_ai.usage.total_tokens'] = args.totalTokens;
  }
  return attrs;
}
