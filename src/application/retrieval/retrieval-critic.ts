import 'server-only';

import { openai } from '@ai-sdk/openai';
import { toStandardJsonSchema } from '@valibot/to-json-schema';
import { waitUntil } from '@vercel/functions';
import { generateObject } from 'ai';
import { err, ok, type Result } from 'neverthrow';
import * as v from 'valibot';
import { recordLlmCost } from '@/application/rate-limit/llm-cost-limiter';
import { type AppError, externalApi } from '@/core/errors';
import type { ZeroEntropySnippet } from '@/core/zeroentropy/types';
import { env } from '@/shared/env';
import { log } from '@/shared/logger';

const RELEVANCE_LEVELS = ['high', 'medium', 'low', 'none'] as const;
export type RelevanceLevel = (typeof RELEVANCE_LEVELS)[number];

const CRITIC_SYSTEM = `You evaluate whether a set of retrieved text snippets actually answers a user search query in a knowledge base of user-uploaded files.

Given the query and snippets, decide the relevance level:
- "high": snippets directly answer the query with specific information.
- "medium": snippets are topically relevant but partial or indirect.
- "low": snippets touch the topic but don't answer the question; retrieval should retry with a different formulation.
- "none": snippets are off-topic; retrieval should retry or give up.

If relevance is "low" or "none", propose a single alternative query formulation that might surface better snippets. Use vocabulary the user might use; prefer different keywords than the original. Empty string if you can't suggest one.

Output strict JSON. Match the language of the original query.`;

const CriticVerdictSchema = v.object({
  relevance: v.picklist(RELEVANCE_LEVELS),
  reason: v.pipe(v.string(), v.minLength(1), v.maxLength(240)),
  suggested_rephrasing: v.pipe(v.string(), v.maxLength(300)),
});
type CriticVerdict = v.InferOutput<typeof CriticVerdictSchema>;
const CriticVerdictJsonSchema = toStandardJsonSchema(CriticVerdictSchema);

const MAX_SNIPPETS_IN_PROMPT = 5;
const MAX_SNIPPET_CHARS_IN_PROMPT = 400;

export type RetrievalAssessment = {
  readonly relevance: RelevanceLevel;
  readonly reason: string;
  readonly suggestedRephrasing: string | null;
};

function snippetsForPrompt(
  snippets: ReadonlyArray<ZeroEntropySnippet>,
): string {
  const items = snippets.slice(0, MAX_SNIPPETS_IN_PROMPT);
  return items
    .map((s, i) => {
      const trimmed =
        s.content.length > MAX_SNIPPET_CHARS_IN_PROMPT
          ? `${s.content.slice(0, MAX_SNIPPET_CHARS_IN_PROMPT)}…`
          : s.content;
      return `[${i + 1}] ${trimmed}`;
    })
    .join('\n\n');
}

export async function assessRetrievalRelevance(args: {
  userId: string;
  query: string;
  snippets: ReadonlyArray<ZeroEntropySnippet>;
}): Promise<Result<RetrievalAssessment, AppError>> {
  if (args.snippets.length === 0) {
    return ok({
      relevance: 'none',
      reason: 'No snippets returned by retrieval.',
      suggestedRephrasing: null,
    });
  }

  const model = env().CHEAP_MODEL;
  const prompt = `QUERY: ${args.query}\n\nRETRIEVED SNIPPETS:\n${snippetsForPrompt(args.snippets)}`;

  try {
    const result = await generateObject({
      model: openai(model),
      schema: CriticVerdictJsonSchema,
      system: CRITIC_SYSTEM,
      prompt,
      maxOutputTokens: 300,
      experimental_telemetry: {
        isEnabled: true,
        recordInputs: false,
        recordOutputs: false,
        functionId: 'retrieval.critic.assess',
        metadata: {
          'critic.snippet_count': args.snippets.length,
          'critic.query_length': args.query.length,
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
    const verdict = result.object as CriticVerdict;
    const suggested = verdict.suggested_rephrasing.trim();
    return ok({
      relevance: verdict.relevance,
      reason: verdict.reason,
      suggestedRephrasing: suggested.length > 0 ? suggested : null,
    });
  } catch (e) {
    log.warn('retrieval.critic.failed_fallback_to_pass', {
      message: e instanceof Error ? e.message : 'unknown',
    });
    return err(
      externalApi(
        'openai',
        `Retrieval critic failed: ${e instanceof Error ? e.message : 'unknown'}`,
      ),
    );
  }
}
