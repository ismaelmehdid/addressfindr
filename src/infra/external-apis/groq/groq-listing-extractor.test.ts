import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_MARKDOWN_CHARS } from '@/core/listing/types';

vi.mock('@/shared/env', () => ({
  env: () => ({
    NODE_ENV: 'test',
    VERCEL_ENV: 'development',
    GROQ_API_KEY: 'gsk-test',
    GROQ_BASE_URL: 'https://api.groq.com/openai/v1',
    LISTING_EXTRACTION_MODEL: 'openai/gpt-oss-120b',
  }),
}));

// why: vi.mock est hoisté au-dessus des const — vi.hoisted évite la TDZ
const { generateObject } = vi.hoisted(() => ({ generateObject: vi.fn() }));

vi.mock('ai', () => ({
  generateObject,
  jsonSchema: (schema: unknown) => schema,
}));
vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: () => (modelId: string) => ({ modelId }),
}));

import { groqListingExtractor } from './groq-listing-extractor';

describe('groqListingExtractor', () => {
  beforeEach(() => {
    generateObject.mockClear();
  });

  it('returns the quotes the model produced', async () => {
    generateObject.mockResolvedValueOnce({
      object: { surfaceM2: '80,5 m²', dpeClass: 'DPE C' },
    });
    const result = await groqListingExtractor.extractQuotes({
      markdown: '80,5 m² DPE C',
      missing: ['surfaceM2', 'dpeClass'],
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.surfaceM2).toBe('80,5 m²');
      expect(result.value.dpeClass).toBe('DPE C');
    }
  });

  it('drops keys that were not requested', async () => {
    generateObject.mockResolvedValueOnce({
      object: { surfaceM2: '80 m²', priceEur: '250 000 €' },
    });
    const result = await groqListingExtractor.extractQuotes({
      markdown: '80 m²',
      missing: ['surfaceM2'],
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value.priceEur).toBeUndefined();
  });

  it('returns an empty map when nothing is missing, without calling the model', async () => {
    generateObject.mockClear();
    const result = await groqListingExtractor.extractQuotes({
      markdown: 'whatever',
      missing: [],
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value).toEqual({});
    expect(generateObject).not.toHaveBeenCalled();
  });

  it('maps a model failure to external_api', async () => {
    generateObject.mockRejectedValueOnce(new Error('rate limited'));
    const result = await groqListingExtractor.extractQuotes({
      markdown: 'x',
      missing: ['surfaceM2'],
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('external_api');
  });

  it('truncates the markdown to MAX_MARKDOWN_CHARS before calling the model', async () => {
    generateObject.mockResolvedValueOnce({ object: {} });
    await groqListingExtractor.extractQuotes({
      markdown: 'x'.repeat(MAX_MARKDOWN_CHARS + 5000),
      missing: ['surfaceM2'],
    });
    const callArg = generateObject.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    const prompt = callArg.prompt as string;
    const xCount = (prompt.match(/x/g) ?? []).length;
    expect(xCount).toBe(MAX_MARKDOWN_CHARS);
  });

  // why: le modele rend une LOCALISATION, pas une valeur. Toute retouche de la
  // chaine — trim, recasse, normalisation — remettrait la production de valeur
  // dans le modele et annulerait tout le dispositif.
  it('returns the model quote byte-identical, without trimming or recasing', async () => {
    const raw = '   80,5 M²  dpe C  ';
    generateObject.mockResolvedValueOnce({ object: { surfaceM2: raw } });
    const result = await groqListingExtractor.extractQuotes({
      markdown: 'whatever',
      missing: ['surfaceM2'],
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value.surfaceM2).toBe(raw);
  });
});
