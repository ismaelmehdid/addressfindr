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
import { expandQueryForRetrieval } from './hyde-generator';

const mockedGen = vi.mocked(generateObject);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('expandQueryForRetrieval', () => {
  it('returns expansion with all four query forms', async () => {
    mockedGen.mockResolvedValueOnce({
      object: {
        hypothetical_answer: 'La cuve 12 est en élevage.',
        paraphrase: 'État de la cuve 12 ?',
        keywords: ['cuve 12', 'élevage', 'volume'],
      },
      usage: { inputTokens: 30, outputTokens: 50 },
    } as never);

    const r = await expandQueryForRetrieval({
      userId: 'u',
      query: "Qu'est-ce qu'il y a dans la cuve 12 ?",
    });
    expect(r.isOk()).toBe(true);
    if (r.isOk()) {
      expect(r.value.original).toBe("Qu'est-ce qu'il y a dans la cuve 12 ?");
      expect(r.value.hypotheticalAnswer).toBe('La cuve 12 est en élevage.');
      expect(r.value.paraphrase).toBe('État de la cuve 12 ?');
      expect(r.value.keywordsQuery).toBe('cuve 12 élevage volume');
    }
  });

  it('returns externalApi error on LLM failure', async () => {
    mockedGen.mockRejectedValueOnce(new Error('llm down'));
    const r = await expandQueryForRetrieval({ userId: 'u', query: 'q' });
    expect(r.isErr()).toBe(true);
    if (r.isErr()) {
      expect(r.error.code).toBe('external_api');
      expect(r.error.message).toContain('HyDE expansion failed');
    }
  });
});
