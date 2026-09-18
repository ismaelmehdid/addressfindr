import 'server-only';

import { openai } from '@ai-sdk/openai';
import { toStandardJsonSchema } from '@valibot/to-json-schema';
import { waitUntil } from '@vercel/functions';
import { generateObject } from 'ai';
import { err, ok, type Result } from 'neverthrow';
import * as v from 'valibot';
import { recordLlmCost } from '@/application/rate-limit/llm-cost-limiter';
import { type AppError, externalApi } from '@/core/errors';
import { env } from '@/shared/env';
import { log } from '@/shared/logger';

const HYDE_SYSTEM = `You expand a user search query into multiple complementary forms to improve retrieval recall in a knowledge base of user-uploaded files.

Generate three forms of the query:

1. "hypothetical_answer" — a short factual passage (1-3 sentences) that would directly answer the query if it were a document. Use vocabulary the user might use. This is a HyDE-style hypothetical document, not a real fact.

2. "paraphrase" — a single rephrasing of the query using different but synonymous terms. Same intent, different surface form.

3. "keywords" — 3-6 highly discriminative keywords or domain terms that any document answering this query would contain (single words or short phrases, no full sentences).

Output strict JSON matching the provided schema. Match the language of the original query (French queries get French outputs).

Rules:
- Never invent specific names, dates, or numbers not in the query.
- Keep each form concise.`;

const HydeExpansionSchema = v.object({
  hypothetical_answer: v.pipe(v.string(), v.minLength(1), v.maxLength(500)),
  paraphrase: v.pipe(v.string(), v.minLength(1), v.maxLength(300)),
  keywords: v.pipe(
    v.array(v.pipe(v.string(), v.minLength(1), v.maxLength(80))),
    v.minLength(1),
    v.maxLength(10),
  ),
});
type HydeExpansion = v.InferOutput<typeof HydeExpansionSchema>;
const HydeExpansionJsonSchema = toStandardJsonSchema(HydeExpansionSchema);

export type ExpandedQuery = {
  readonly original: string;
  readonly hypotheticalAnswer: string;
  readonly paraphrase: string;
  readonly keywordsQuery: string;
};

export async function expandQueryForRetrieval(args: {
  userId: string;
  query: string;
}): Promise<Result<ExpandedQuery, AppError>> {
  const model = env().CHEAP_MODEL;
  try {
    const result = await generateObject({
      model: openai(model),
      schema: HydeExpansionJsonSchema,
      system: HYDE_SYSTEM,
      prompt: args.query,
      maxOutputTokens: 400,
      experimental_telemetry: {
        isEnabled: true,
        recordInputs: false,
        recordOutputs: false,
        functionId: 'retrieval.hyde_expand',
        metadata: { 'hyde.query_length': args.query.length },
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
    const expansion = result.object as HydeExpansion;
    return ok({
      original: args.query,
      hypotheticalAnswer: expansion.hypothetical_answer,
      paraphrase: expansion.paraphrase,
      keywordsQuery: expansion.keywords.join(' '),
    });
  } catch (e) {
    log.warn('retrieval.hyde.failed_fallback_to_original', {
      message: e instanceof Error ? e.message : 'unknown',
    });
    return err(
      externalApi(
        'openai',
        `HyDE expansion failed: ${e instanceof Error ? e.message : 'unknown'}`,
      ),
    );
  }
}
