import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/shared/env', () => ({
  env: () => ({ CHEAP_MODEL: 'gpt-5.4-nano', OPENAI_API_KEY: 'sk' }),
}));

vi.mock('@/application/rate-limit/llm-cost-limiter', () => ({
  recordLlmCost: vi.fn(async () => {}),
}));

vi.mock('ai', () => ({ generateObject: vi.fn() }));

vi.mock('@ai-sdk/openai', () => ({
  openai: (m: string) => ({ modelId: m }),
}));

import { generateObject } from 'ai';
import type { ZeroEntropySnippet } from '@/core/zeroentropy/types';
import { assessRetrievalRelevance } from './retrieval-critic';

const mockedGen = vi.mocked(generateObject);

function snip(content: string, score = 0.5): ZeroEntropySnippet {
  return { path: 'p', content, score, pageSpan: null, documentMetadata: {} };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('assessRetrievalRelevance', () => {
  it('returns "none" without calling LLM when snippets empty', async () => {
    const r = await assessRetrievalRelevance({
      userId: 'u',
      query: 'q',
      snippets: [],
    });
    expect(r.isOk()).toBe(true);
    if (r.isOk()) {
      expect(r.value.relevance).toBe('none');
      expect(r.value.suggestedRephrasing).toBeNull();
    }
    expect(mockedGen).not.toHaveBeenCalled();
  });

  it('returns verdict from LLM for non-empty snippets', async () => {
    mockedGen.mockResolvedValueOnce({
      object: {
        relevance: 'high',
        reason: 'direct answer',
        suggested_rephrasing: '',
      },
      usage: { inputTokens: 30, outputTokens: 20 },
    } as never);
    const r = await assessRetrievalRelevance({
      userId: 'u',
      query: 'q',
      snippets: [snip('a relevant snippet')],
    });
    expect(r.isOk()).toBe(true);
    if (r.isOk()) {
      expect(r.value.relevance).toBe('high');
      expect(r.value.suggestedRephrasing).toBeNull();
    }
  });

  it('returns suggested rephrasing when non-empty', async () => {
    mockedGen.mockResolvedValueOnce({
      object: {
        relevance: 'low',
        reason: 'off-topic',
        suggested_rephrasing: '   try this instead   ',
      },
      usage: { inputTokens: 30, outputTokens: 20 },
    } as never);
    const r = await assessRetrievalRelevance({
      userId: 'u',
      query: 'q',
      snippets: [snip('content')],
    });
    expect(r.isOk()).toBe(true);
    if (r.isOk()) expect(r.value.suggestedRephrasing).toBe('try this instead');
  });

  it('truncates long snippets in the prompt', async () => {
    mockedGen.mockResolvedValueOnce({
      object: {
        relevance: 'medium',
        reason: 'r',
        suggested_rephrasing: '',
      },
      usage: { inputTokens: 0, outputTokens: 0 },
    } as never);
    await assessRetrievalRelevance({
      userId: 'u',
      query: 'q',
      snippets: [snip('x'.repeat(2000))],
    });
    const call = mockedGen.mock.calls[0]?.[0] as { prompt: string };
    expect(call.prompt).toContain('…');
    expect(call.prompt.length).toBeLessThan(2000);
  });

  it('returns externalApi error on LLM failure', async () => {
    mockedGen.mockRejectedValueOnce(new Error('llm down'));
    const r = await assessRetrievalRelevance({
      userId: 'u',
      query: 'q',
      snippets: [snip('x')],
    });
    expect(r.isErr()).toBe(true);
    if (r.isErr()) expect(r.error.code).toBe('external_api');
  });
});
