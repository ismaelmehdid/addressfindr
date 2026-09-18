import { err, ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/telemetry/with-span', () => ({
  addCurrentSpanAttributes: vi.fn(),
}));

const envMock = vi.hoisted(() => ({
  RETRIEVAL_USE_HYDE: false,
  RETRIEVAL_USE_CRAG: false,
  CHEAP_MODEL: 'gpt-5.4-nano',
}));

vi.mock('@/shared/env', () => ({
  env: () => envMock,
}));

vi.mock('@/infra/external-apis/zeroentropy/client', () => ({
  zeroEntropyClient: { queryTopSnippets: vi.fn() },
}));

vi.mock('./hyde-generator', () => ({
  expandQueryForRetrieval: vi.fn(),
}));

vi.mock('./retrieval-critic', () => ({
  assessRetrievalRelevance: vi.fn(),
}));

import { externalApi } from '@/core/errors';
import type { ZeroEntropySnippet } from '@/core/zeroentropy/types';
import { zeroEntropyClient } from '@/infra/external-apis/zeroentropy/client';
import { expandQueryForRetrieval } from './hyde-generator';
import { multiQuerySearch } from './multi-query-search';
import { assessRetrievalRelevance } from './retrieval-critic';

const mockedQuery = vi.mocked(zeroEntropyClient.queryTopSnippets);
const mockedHyde = vi.mocked(expandQueryForRetrieval);
const mockedCritic = vi.mocked(assessRetrievalRelevance);

function snip(path: string, score = 0.5): ZeroEntropySnippet {
  return { path, content: path, score, pageSpan: null, documentMetadata: {} };
}

beforeEach(() => {
  vi.clearAllMocks();
  envMock.RETRIEVAL_USE_HYDE = false;
  envMock.RETRIEVAL_USE_CRAG = false;
});

describe('multiQuerySearch — plain path (no HyDE, no CRAG)', () => {
  it('forwards the single query and returns its results', async () => {
    mockedQuery.mockResolvedValueOnce(ok([snip('a'), snip('b')]));
    const r = await multiQuerySearch({
      userId: 'u',
      collectionName: 'c',
      query: 'q',
      k: 5,
    });
    expect(r.isOk()).toBe(true);
    if (r.isOk()) expect(r.value.map((s) => s.path)).toEqual(['a', 'b']);
    expect(mockedQuery).toHaveBeenCalledOnce();
    expect(mockedHyde).not.toHaveBeenCalled();
    expect(mockedCritic).not.toHaveBeenCalled();
  });

  it('returns the underlying error verbatim', async () => {
    mockedQuery.mockResolvedValueOnce(err(externalApi('ze', 'down')));
    const r = await multiQuerySearch({
      userId: 'u',
      collectionName: 'c',
      query: 'q',
      k: 5,
    });
    expect(r.isErr()).toBe(true);
  });
});

describe('multiQuerySearch — HyDE expansion', () => {
  it('fuses results from all expansion queries', async () => {
    envMock.RETRIEVAL_USE_HYDE = true;
    mockedHyde.mockResolvedValueOnce(
      ok({
        original: 'q',
        hypotheticalAnswer: 'h',
        paraphrase: 'p',
        keywordsQuery: 'k',
      }),
    );
    mockedQuery
      .mockResolvedValueOnce(ok([snip('a', 0.9), snip('b', 0.6)]))
      .mockResolvedValueOnce(ok([snip('a', 0.8), snip('c', 0.5)]))
      .mockResolvedValueOnce(ok([snip('d', 0.4)]))
      .mockResolvedValueOnce(ok([snip('a', 0.7)]));
    const r = await multiQuerySearch({
      userId: 'u',
      collectionName: 'c',
      query: 'q',
      k: 3,
    });
    expect(r.isOk()).toBe(true);
    if (r.isOk()) {
      expect(r.value).toHaveLength(3);
      expect(r.value[0]!.path).toBe('a'); // appears in 3 lists → top of RRF
    }
    expect(mockedQuery).toHaveBeenCalledTimes(4);
  });

  it('falls back to single query when expansion fails', async () => {
    envMock.RETRIEVAL_USE_HYDE = true;
    mockedHyde.mockResolvedValueOnce(err(externalApi('openai', 'fail')));
    mockedQuery.mockResolvedValueOnce(ok([snip('x')]));
    const r = await multiQuerySearch({
      userId: 'u',
      collectionName: 'c',
      query: 'q',
      k: 5,
    });
    expect(r.isOk()).toBe(true);
    expect(mockedQuery).toHaveBeenCalledTimes(1);
  });
});

describe('multiQuerySearch — CRAG retry', () => {
  it('accepts on high relevance, no retry', async () => {
    envMock.RETRIEVAL_USE_CRAG = true;
    mockedQuery.mockResolvedValueOnce(ok([snip('a')]));
    mockedCritic.mockResolvedValueOnce(
      ok({ relevance: 'high', reason: 'r', suggestedRephrasing: null }),
    );
    const r = await multiQuerySearch({
      userId: 'u',
      collectionName: 'c',
      query: 'q',
      k: 5,
    });
    expect(r.isOk()).toBe(true);
    expect(mockedQuery).toHaveBeenCalledTimes(1);
  });

  it('gives up when critic suggests nothing', async () => {
    envMock.RETRIEVAL_USE_CRAG = true;
    mockedQuery.mockResolvedValueOnce(ok([snip('a')]));
    mockedCritic.mockResolvedValueOnce(
      ok({ relevance: 'none', reason: 'off', suggestedRephrasing: null }),
    );
    const r = await multiQuerySearch({
      userId: 'u',
      collectionName: 'c',
      query: 'q',
      k: 5,
    });
    expect(r.isOk()).toBe(true);
    expect(mockedQuery).toHaveBeenCalledTimes(1);
  });

  it('retries once with rephrased query then accepts', async () => {
    envMock.RETRIEVAL_USE_CRAG = true;
    mockedQuery
      .mockResolvedValueOnce(ok([snip('a')]))
      .mockResolvedValueOnce(ok([snip('b', 0.95)]));
    mockedCritic
      .mockResolvedValueOnce(
        ok({
          relevance: 'low',
          reason: 'r',
          suggestedRephrasing: 'better q',
        }),
      )
      .mockResolvedValueOnce(
        ok({ relevance: 'high', reason: 'r', suggestedRephrasing: null }),
      );
    const r = await multiQuerySearch({
      userId: 'u',
      collectionName: 'c',
      query: 'q',
      k: 5,
    });
    expect(r.isOk()).toBe(true);
    if (r.isOk()) expect(r.value.map((s) => s.path)).toEqual(['b']);
    expect(mockedQuery).toHaveBeenCalledTimes(2);
  });

  it('returns original result when critic itself fails', async () => {
    envMock.RETRIEVAL_USE_CRAG = true;
    mockedQuery.mockResolvedValueOnce(ok([snip('a')]));
    mockedCritic.mockResolvedValueOnce(err(externalApi('openai', 'down')));
    const r = await multiQuerySearch({
      userId: 'u',
      collectionName: 'c',
      query: 'q',
      k: 5,
    });
    expect(r.isOk()).toBe(true);
  });
});
