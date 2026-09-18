import 'server-only';

import { openai } from '@ai-sdk/openai';
import { toStandardJsonSchema } from '@valibot/to-json-schema';
import { waitUntil } from '@vercel/functions';
import { generateObject } from 'ai';
import * as v from 'valibot';
import { recordLlmCost } from '@/application/rate-limit/llm-cost-limiter';
import { env } from '@/shared/env';
import { log } from '@/shared/logger';

const COHERENCE_LEVELS = [
  'faithful',
  'plausible',
  'suspicious',
  'hallucinated',
] as const;
export type CoherenceLevel = (typeof COHERENCE_LEVELS)[number];

const CRITIC_SYSTEM = `You audit an AI assistant's response for coherence and plausibility in a workspace assistant chat.

You see only:
- The user's latest question
- The assistant's final response

You do NOT see the documents/tools the assistant used. So you can only judge:
- "faithful": response is well-structured, addresses the question, doesn't make grandiose unverifiable claims
- "plausible": response is reasonable but contains some claims you can't verify without context
- "suspicious": response has hedging that suggests uncertainty, contains domain-inappropriate vocabulary, OR claims specific facts that look suspiciously specific without grounding
- "hallucinated": response makes confident specific claims (numbers, dates, ids, names) that aren't visibly grounded; OR contradicts itself; OR is irrelevant to the question

Output strict JSON. Pick the most negative applicable level. Match the language of the conversation.`;

const VerdictSchema = v.object({
  coherence: v.picklist(COHERENCE_LEVELS),
  concerns: v.pipe(
    v.array(v.pipe(v.string(), v.minLength(1), v.maxLength(200))),
    v.maxLength(5),
  ),
});
type Verdict = v.InferOutput<typeof VerdictSchema>;
const VerdictJsonSchema = toStandardJsonSchema(VerdictSchema);

const MAX_QUERY_CHARS = 800;
const MAX_RESPONSE_CHARS = 2400;

export async function auditCoherence(args: {
  userId: string;
  threadId: string;
  agentId: string;
  query: string;
  response: string;
}): Promise<void> {
  if (env().CHAT_POST_STREAM_CRITIC !== true) return;
  if (args.response.trim().length === 0) return;

  const model = env().CHEAP_MODEL;
  const truncatedQuery =
    args.query.length > MAX_QUERY_CHARS
      ? `${args.query.slice(0, MAX_QUERY_CHARS)}…`
      : args.query;
  const truncatedResponse =
    args.response.length > MAX_RESPONSE_CHARS
      ? `${args.response.slice(0, MAX_RESPONSE_CHARS)}…`
      : args.response;
  const prompt = `USER QUESTION:\n${truncatedQuery}\n\nASSISTANT RESPONSE:\n${truncatedResponse}`;

  try {
    const result = await generateObject({
      model: openai(model),
      schema: VerdictJsonSchema,
      system: CRITIC_SYSTEM,
      prompt,
      maxOutputTokens: 200,
      experimental_telemetry: {
        isEnabled: true,
        recordInputs: false,
        recordOutputs: false,
        functionId: 'chat.post_stream_critic',
        metadata: {
          'critic.thread_id': args.threadId,
          'critic.agent_id': args.agentId,
          'critic.query_length': args.query.length,
          'critic.response_length': args.response.length,
        },
      },
    });
    waitUntil(
      recordLlmCost({
        userId: args.userId,
        model,
        inputTokens: result.usage.inputTokens ?? 0,
        outputTokens: result.usage.outputTokens ?? 0,
      }),
    );
    const verdict = result.object as Verdict;
    if (verdict.coherence === 'faithful' || verdict.coherence === 'plausible') {
      log.info('chat.post_stream_critic.ok', {
        userId: args.userId,
        threadId: args.threadId,
        agentId: args.agentId,
        coherence: verdict.coherence,
      });
      return;
    }
    log.warn('chat.post_stream_critic.flagged', {
      userId: args.userId,
      threadId: args.threadId,
      agentId: args.agentId,
      coherence: verdict.coherence,
      concernCount: verdict.concerns.length,
    });
  } catch (e) {
    log.warn('chat.post_stream_critic.failed', {
      userId: args.userId,
      threadId: args.threadId,
      message: e instanceof Error ? e.message : 'unknown',
    });
  }
}
