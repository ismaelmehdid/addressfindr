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

  // why: measured 2026-09-24, Groq's strict structured output rejects a schema
  // whose `required` does not list every property ("`required` is required
  // to be supplied and to be an array including every key in properties").
  // Every quote extraction failed on every portal, silently.
  it('declares every requested field required and nullable', async () => {
    generateObject.mockResolvedValueOnce({ object: {} });
    await groqListingExtractor.extractQuotes({
      markdown: '80 m²',
      missing: ['surfaceM2', 'dpeDate'],
    });
    const { schema } = generateObject.mock.calls[0]?.[0] as {
      schema: {
        required: string[];
        properties: Record<string, { type: string[] }>;
      };
    };
    expect(schema.required).toEqual(['surfaceM2', 'dpeDate']);
    expect(schema.properties.dpeDate?.type).toEqual(['string', 'null']);
  });

  it('treats a null quote as an absent field', async () => {
    generateObject.mockResolvedValueOnce({
      object: { surfaceM2: '80 m²', dpeDate: null },
    });
    const result = await groqListingExtractor.extractQuotes({
      markdown: '80 m²',
      missing: ['surfaceM2', 'dpeDate'],
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.surfaceM2).toBe('80 m²');
      expect(result.value.dpeDate).toBeUndefined();
    }
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

  it('maps a model failure to external_api once every attempt failed', async () => {
    generateObject.mockRejectedValue(new Error('rate limited'));
    const result = await groqListingExtractor.extractQuotes({
      markdown: 'x',
      missing: ['surfaceM2'],
    });
    generateObject.mockReset();
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('external_api');
  });

  // why: measured 2026-09-24, 6 calls out of 25 came back from Groq as
  // "Generated JSON does not match the expected schema … missing properties",
  // despite strict mode. The same call succeeded when replayed. A failed call
  // lost every quote — the DPE date included — and changed the answer.
  it('retries a generation that did not match the schema', async () => {
    generateObject
      .mockRejectedValueOnce(
        new Error('Generated JSON does not match the expected schema'),
      )
      .mockResolvedValueOnce({ object: { surfaceM2: '80 m²' } });
    const result = await groqListingExtractor.extractQuotes({
      markdown: '80 m²',
      missing: ['surfaceM2'],
    });
    expect(generateObject).toHaveBeenCalledTimes(2);
    expect(result._unsafeUnwrap().surfaceM2).toBe('80 m²');
  });

  // why: measured 2026-09-24, the free tier allows 200 000 tokens a day and
  // the SDK already retries a 429 itself. Retrying it again only burns the
  // quota faster — nine calls for one listing.
  it('never retries a rate-limited call', async () => {
    generateObject.mockRejectedValue(
      Object.assign(new Error('Rate limit reached'), { statusCode: 429 }),
    );
    const result = await groqListingExtractor.extractQuotes({
      markdown: 'x',
      missing: ['surfaceM2'],
    });
    expect(generateObject).toHaveBeenCalledTimes(1);
    expect(result.isErr()).toBe(true);
    generateObject.mockReset();
  });

  it('never retries a rate limit the SDK already retried', async () => {
    generateObject.mockRejectedValue(
      Object.assign(new Error('Failed after 3 attempts'), {
        lastError: { statusCode: 429 },
      }),
    );
    await groqListingExtractor.extractQuotes({
      markdown: 'x',
      missing: ['surfaceM2'],
    });
    expect(generateObject).toHaveBeenCalledTimes(1);
    generateObject.mockReset();
  });

  it('gives up after three attempts', async () => {
    generateObject.mockRejectedValue(new Error('schema mismatch'));
    await groqListingExtractor.extractQuotes({
      markdown: 'x',
      missing: ['surfaceM2'],
    });
    expect(generateObject).toHaveBeenCalledTimes(3);
    generateObject.mockReset();
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

  // why: la fenetre autour du contenu tiers doit fermer symetriquement — un
  // marqueur ouvrant sans fermant equivalent est plus facile a confondre avec
  // une instruction pour un modele qui lit une page non fiable.
  it('closes the untrusted-content fence symmetrically', async () => {
    generateObject.mockResolvedValueOnce({ object: {} });
    await groqListingExtractor.extractQuotes({
      markdown: 'contenu de la page',
      missing: ['surfaceM2'],
    });
    const callArg = generateObject.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    const prompt = callArg.prompt as string;
    expect(prompt).toContain('<<<TEXTE_SOURCE');
    expect(prompt).toContain('TEXTE_SOURCE>>>');
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
