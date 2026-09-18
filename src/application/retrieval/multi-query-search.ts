import 'server-only';

import { err, ok, type Result } from 'neverthrow';
import type { AppError } from '@/core/errors';
import { reciprocalRankFusion } from '@/core/retrieval/rrf';
import type { ZeroEntropyQueryFilter } from '@/core/zeroentropy/ports/zeroentropy-client.port';
import type { ZeroEntropySnippet } from '@/core/zeroentropy/types';
import { zeroEntropyClient } from '@/infra/external-apis/zeroentropy/client';
import { env } from '@/shared/env';
import { addCurrentSpanAttributes } from '@/shared/telemetry/with-span';
import { expandQueryForRetrieval } from './hyde-generator';
import { assessRetrievalRelevance } from './retrieval-critic';

export type MultiQuerySearchInput = {
  readonly userId: string;
  readonly collectionName: string;
  readonly query: string;
  readonly k: number;
  readonly filter?: ZeroEntropyQueryFilter;
};

const CRAG_MAX_RETRIES = 1;

function snippetKey(s: ZeroEntropySnippet): string {
  const span = s.pageSpan ? `${s.pageSpan[0]}:${s.pageSpan[1]}` : 'null';
  return `${s.path}::${span}`;
}

function isHydeEnabled(): boolean {
  return env().RETRIEVAL_USE_HYDE === true;
}

function isCragEnabled(): boolean {
  return env().RETRIEVAL_USE_CRAG === true;
}

async function singleQueryFetch(args: {
  collectionName: string;
  query: string;
  k: number;
  filter?: ZeroEntropyQueryFilter;
}): Promise<Result<ZeroEntropySnippet[], AppError>> {
  const result = await zeroEntropyClient.queryTopSnippets({
    collectionName: args.collectionName,
    query: args.query,
    k: args.k,
    filter: args.filter,
  });
  if (result.isErr()) return err(result.error);
  return ok([...result.value]);
}

async function hydeFusedFetch(args: {
  userId: string;
  collectionName: string;
  query: string;
  k: number;
  filter?: ZeroEntropyQueryFilter;
}): Promise<Result<ZeroEntropySnippet[], AppError>> {
  const expansion = await expandQueryForRetrieval({
    userId: args.userId,
    query: args.query,
  });
  if (expansion.isErr()) {
    addCurrentSpanAttributes({
      'retrieval.hyde_status': 'failed-fallback',
    });
    return singleQueryFetch(args);
  }

  const queries: string[] = [
    expansion.value.original,
    expansion.value.hypotheticalAnswer,
    expansion.value.paraphrase,
    expansion.value.keywordsQuery,
  ];

  const settled = await Promise.allSettled(
    queries.map((q) =>
      zeroEntropyClient.queryTopSnippets({
        collectionName: args.collectionName,
        query: q,
        k: args.k,
        filter: args.filter,
      }),
    ),
  );

  const rankedLists: ReadonlyArray<ZeroEntropySnippet>[] = [];
  let firstError: AppError | null = null;
  for (const s of settled) {
    if (s.status === 'fulfilled') {
      if (s.value.isOk()) rankedLists.push(s.value.value);
      else if (!firstError) firstError = s.value.error;
    }
  }

  if (rankedLists.length === 0) {
    if (firstError) return err(firstError);
    return ok([]);
  }

  const fused = reciprocalRankFusion({
    rankedLists,
    keyFn: snippetKey,
  });

  addCurrentSpanAttributes({
    'retrieval.hyde_status': 'applied',
    'retrieval.hyde_query_count': queries.length,
    'retrieval.hyde_successful_lists': rankedLists.length,
    'retrieval.hyde_fused_count': fused.length,
  });

  return ok(fused.slice(0, args.k).map((f) => f.item));
}

async function fetchOnce(
  input: MultiQuerySearchInput,
  effectiveQuery: string,
): Promise<Result<ZeroEntropySnippet[], AppError>> {
  if (isHydeEnabled()) {
    return hydeFusedFetch({
      userId: input.userId,
      collectionName: input.collectionName,
      query: effectiveQuery,
      k: input.k,
      filter: input.filter,
    });
  }
  return singleQueryFetch({
    collectionName: input.collectionName,
    query: effectiveQuery,
    k: input.k,
    filter: input.filter,
  });
}

export async function multiQuerySearch(
  input: MultiQuerySearchInput,
): Promise<Result<ZeroEntropySnippet[], AppError>> {
  addCurrentSpanAttributes({
    'retrieval.hyde_enabled': isHydeEnabled(),
    'retrieval.crag_enabled': isCragEnabled(),
  });

  let activeQuery = input.query;
  let lastResult = await fetchOnce(input, activeQuery);

  if (!isCragEnabled() || lastResult.isErr()) {
    return lastResult;
  }

  for (let attempt = 0; attempt <= CRAG_MAX_RETRIES; attempt += 1) {
    const snippets = lastResult.isOk() ? lastResult.value : [];
    const assessment = await assessRetrievalRelevance({
      userId: input.userId,
      query: activeQuery,
      snippets,
    });
    if (assessment.isErr()) {
      addCurrentSpanAttributes({
        'retrieval.crag_status': 'critic-failed',
        'retrieval.crag_attempts': attempt + 1,
      });
      return lastResult;
    }
    const verdict = assessment.value;
    if (verdict.relevance === 'high' || verdict.relevance === 'medium') {
      addCurrentSpanAttributes({
        'retrieval.crag_status': 'accepted',
        'retrieval.crag_attempts': attempt + 1,
        'retrieval.crag_relevance': verdict.relevance,
      });
      return lastResult;
    }
    if (
      attempt >= CRAG_MAX_RETRIES ||
      verdict.suggestedRephrasing === null ||
      verdict.suggestedRephrasing === activeQuery
    ) {
      addCurrentSpanAttributes({
        'retrieval.crag_status': 'gave-up',
        'retrieval.crag_attempts': attempt + 1,
        'retrieval.crag_relevance': verdict.relevance,
      });
      return lastResult;
    }
    activeQuery = verdict.suggestedRephrasing;
    addCurrentSpanAttributes({
      'retrieval.crag_status': 'retrying',
      'retrieval.crag_attempts': attempt + 1,
      'retrieval.crag_relevance': verdict.relevance,
    });
    lastResult = await fetchOnce(input, activeQuery);
  }

  return lastResult;
}
